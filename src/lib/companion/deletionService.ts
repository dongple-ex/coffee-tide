import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CompanionDeletionScope,
  DeletionJobState,
  mapDeletionJobRow,
} from "./deletionJobs";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export class CompanionDeletionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokensMatch(actualToken: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(actualToken), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createDeletionChallenge(params: {
  admin: SupabaseClient;
  userId: string;
  scope: CompanionDeletionScope;
  personaId?: string;
  preserveRelationship?: boolean;
}): Promise<{ job: DeletionJobState; confirmToken: string }> {
  const { count, error: countError } = await params.admin
    .from("companion_deletion_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString());
  if (countError) throw new CompanionDeletionError("deletion_challenge_limit_check_failed", 500);
  if ((count || 0) >= 5) {
    throw new CompanionDeletionError("too_many_pending_deletion_challenges", 429);
  }

  const confirmToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const { data, error } = await params.admin
    .from("companion_deletion_jobs")
    .insert({
      user_id: params.userId,
      scope: params.scope,
      persona_id: params.personaId || null,
      preserve_relationship:
        params.scope === "growth" ? params.preserveRelationship !== false : true,
      confirm_token_hash: hashToken(confirmToken),
      status: "pending",
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new CompanionDeletionError("deletion_challenge_create_failed", 500);
  }
  return { job: mapDeletionJobRow(data), confirmToken };
}

export async function getDeletionJob(params: {
  admin: SupabaseClient;
  userId: string;
  jobId: string;
}): Promise<DeletionJobState | null> {
  const { data, error } = await params.admin
    .from("companion_deletion_jobs")
    .select("*")
    .eq("id", params.jobId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error) throw new CompanionDeletionError("deletion_job_read_failed", 500);
  return data ? mapDeletionJobRow(data) : null;
}

export async function executeDeletionChallenge(params: {
  admin: SupabaseClient;
  userId: string;
  jobId: string;
  confirmToken: string;
}): Promise<DeletionJobState> {
  const { data: row, error: readError } = await params.admin
    .from("companion_deletion_jobs")
    .select("*")
    .eq("id", params.jobId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (readError) throw new CompanionDeletionError("deletion_job_read_failed", 500);
  if (!row) throw new CompanionDeletionError("deletion_job_not_found", 404);
  if (row.status === "completed") return mapDeletionJobRow(row);
  if (row.status !== "pending") throw new CompanionDeletionError("deletion_job_not_pending", 409);
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new CompanionDeletionError("deletion_confirmation_expired", 410);
  }
  if (!tokensMatch(params.confirmToken, row.confirm_token_hash)) {
    throw new CompanionDeletionError("invalid_confirmation_token", 403);
  }

  const { error: deleteError } = await params.admin.rpc("delete_companion_data", {
    p_job_id: params.jobId,
    p_user_id: params.userId,
    p_scope: row.scope,
    p_persona_id: row.persona_id,
    p_preserve_relationship: row.preserve_relationship,
  });
  if (deleteError) {
    const current = await getDeletionJob(params);
    if (current?.status === "completed") return current;
    await params.admin
      .from("companion_deletion_jobs")
      .update({ status: "failed", error_code: "delete_rpc_failed", completed_at: new Date().toISOString() })
      .eq("id", params.jobId)
      .eq("user_id", params.userId)
      .eq("status", "pending");
    throw new CompanionDeletionError("delete_rpc_failed", 500);
  }

  const completed = await getDeletionJob(params);
  if (!completed) throw new CompanionDeletionError("deletion_job_not_found", 404);
  return completed;
}
