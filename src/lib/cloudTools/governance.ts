import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import type { CloudToolEffect, CloudToolResult } from "./types";

const APPROVAL_TTL_MS = 5 * 60_000;
const MAX_CALLS_PER_MINUTE = 20;

interface ApprovalRecord {
  tokenHash: string;
  actorHash: string;
  sessionHash: string;
  toolId: string;
  inputHash: string;
  idempotencyKey: string;
  expiresAt: string;
  consumedAt?: string;
}

interface IdempotencyRecord {
  actorHash: string;
  sessionHash: string;
  toolId: string;
  idempotencyKey: string;
  inputHash: string;
  approvalTokenHash: string;
  status: "pending" | "succeeded" | "failed";
  result?: CloudToolResult;
}

const memoryApprovals = new Map<string, ApprovalRecord>();
const memoryIdempotency = new Map<string, IdempotencyRecord>();
const memoryRateWindows = new Map<string, number[]>();

export class CloudToolGovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudToolGovernanceError";
  }
}

function digest(value: string): string {
  const salt =
    process.env.CLOUD_TOOL_AUDIT_SALT ||
    process.env.SESSION_ENCRYPTION_SECRET ||
    "coffeetide-development-audit";
  return createHash("sha256").update(`${salt}\u0000${value}`).digest("hex");
}

function canonicalInput(input: Record<string, string | number | boolean>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)))
  );
}

export function cloudToolActorHash(userId: string): string {
  return digest(`actor\u0000${userId}`).slice(0, 32);
}

export function cloudToolSessionHash(userId: string, sessionBinding: string): string {
  return digest(`session\u0000${userId}\u0000${sessionBinding}`);
}

export function cloudToolInputHash(
  toolId: string,
  input: Record<string, string | number | boolean>
): string {
  return digest(`input\u0000${toolId}\u0000${canonicalInput(input)}`);
}

function memoryAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

function idempotencyMemoryKey(record: {
  actorHash: string;
  toolId: string;
  idempotencyKey: string;
}): string {
  return `${record.actorHash}\u0000${record.toolId}\u0000${record.idempotencyKey}`;
}

export async function assertExternalWriteGovernanceReady(): Promise<void> {
  const admin = createAdminSupabaseClient();
  if (admin) {
    const { error } = await admin.from("cloud_tool_approvals").select("token_hash").limit(1);
    if (!error) return;
  }
  if (memoryAllowed()) return;
  throw new CloudToolGovernanceError(
    "외부 쓰기 승인 저장소를 사용할 수 없습니다. Supabase Phase D 마이그레이션을 적용해 주세요."
  );
}

export async function issueExternalWriteApproval(options: {
  userId: string;
  sessionBinding: string;
  toolId: string;
  inputHash: string;
  idempotencyKey: string;
}): Promise<{ token: string; expiresAt: string }> {
  await assertExternalWriteGovernanceReady();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = digest(`approval\u0000${token}`);
  const actorHash = cloudToolActorHash(options.userId);
  const sessionHash = cloudToolSessionHash(options.userId, options.sessionBinding);
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS).toISOString();
  const row = {
    token_hash: tokenHash,
    actor_hash: actorHash,
    session_hash: sessionHash,
    tool_id: options.toolId,
    input_hash: options.inputHash,
    idempotency_key: options.idempotencyKey,
    expires_at: expiresAt,
  };
  const admin = createAdminSupabaseClient();
  if (admin) {
    const { error } = await admin.from("cloud_tool_approvals").insert(row);
    if (!error) return { token, expiresAt };
    if (!memoryAllowed()) throw new CloudToolGovernanceError("외부 쓰기 승인 발급에 실패했습니다.");
  }
  memoryApprovals.set(tokenHash, {
    tokenHash,
    actorHash,
    sessionHash,
    toolId: options.toolId,
    inputHash: options.inputHash,
    idempotencyKey: options.idempotencyKey,
    expiresAt,
  });
  return { token, expiresAt };
}

async function consumeApproval(options: {
  tokenHash: string;
  actorHash: string;
  sessionHash: string;
  toolId: string;
  inputHash: string;
  idempotencyKey: string;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const admin = createAdminSupabaseClient();
  if (admin) {
    const { data, error } = await admin
      .from("cloud_tool_approvals")
      .update({ consumed_at: now })
      .eq("token_hash", options.tokenHash)
      .eq("actor_hash", options.actorHash)
      .eq("session_hash", options.sessionHash)
      .eq("tool_id", options.toolId)
      .eq("input_hash", options.inputHash)
      .eq("idempotency_key", options.idempotencyKey)
      .is("consumed_at", null)
      .gt("expires_at", now)
      .select("token_hash")
      .maybeSingle();
    if (!error) return Boolean(data);
    if (!memoryAllowed()) throw new CloudToolGovernanceError("외부 쓰기 승인 확인에 실패했습니다.");
  }
  const record = memoryApprovals.get(options.tokenHash);
  if (
    !record ||
    record.consumedAt ||
    record.expiresAt <= now ||
    record.actorHash !== options.actorHash ||
    record.sessionHash !== options.sessionHash ||
    record.toolId !== options.toolId ||
    record.inputHash !== options.inputHash ||
    record.idempotencyKey !== options.idempotencyKey
  ) {
    return false;
  }
  record.consumedAt = now;
  return true;
}

async function readIdempotency(options: {
  actorHash: string;
  sessionHash: string;
  toolId: string;
  idempotencyKey: string;
  inputHash: string;
  tokenHash: string;
}): Promise<IdempotencyRecord | null> {
  const admin = createAdminSupabaseClient();
  if (admin) {
    const { data, error } = await admin
      .from("cloud_tool_idempotency")
      .select("status,result")
      .eq("actor_hash", options.actorHash)
      .eq("session_hash", options.sessionHash)
      .eq("tool_id", options.toolId)
      .eq("idempotency_key", options.idempotencyKey)
      .eq("input_hash", options.inputHash)
      .eq("approval_token_hash", options.tokenHash)
      .maybeSingle();
    if (!error && data) {
      return {
        ...options,
        approvalTokenHash: options.tokenHash,
        status: data.status as IdempotencyRecord["status"],
        ...(data.result ? { result: data.result as CloudToolResult } : {}),
      };
    }
    if (error && !memoryAllowed()) {
      throw new CloudToolGovernanceError("멱등성 기록을 확인하지 못했습니다.");
    }
  }
  return memoryIdempotency.get(idempotencyMemoryKey(options)) ?? null;
}

export async function authorizeExternalWrite(options: {
  userId: string;
  sessionBinding: string;
  toolId: string;
  inputHash: string;
  idempotencyKey: string;
  approvalToken: string;
}): Promise<{ replayResult?: CloudToolResult }> {
  const actorHash = cloudToolActorHash(options.userId);
  const sessionHash = cloudToolSessionHash(options.userId, options.sessionBinding);
  const tokenHash = digest(`approval\u0000${options.approvalToken}`);
  const key = {
    actorHash,
    sessionHash,
    toolId: options.toolId,
    idempotencyKey: options.idempotencyKey,
    inputHash: options.inputHash,
    tokenHash,
  };
  const consumed = await consumeApproval(key);
  if (!consumed) {
    const replay = await readIdempotency(key);
    if (replay?.status === "succeeded" && replay.result) return { replayResult: replay.result };
    throw new CloudToolGovernanceError("승인이 만료됐거나 이미 사용됐습니다. 내용을 다시 확인해 주세요.");
  }

  const row = {
    actor_hash: actorHash,
    session_hash: sessionHash,
    tool_id: options.toolId,
    idempotency_key: options.idempotencyKey,
    input_hash: options.inputHash,
    approval_token_hash: tokenHash,
    status: "pending",
  };
  const admin = createAdminSupabaseClient();
  if (admin) {
    const { error } = await admin.from("cloud_tool_idempotency").insert(row);
    if (!error) return {};
    const existing = await readIdempotency(key);
    if (existing?.status === "succeeded" && existing.result) {
      return { replayResult: existing.result };
    }
    if (!memoryAllowed()) {
      throw new CloudToolGovernanceError("동일한 외부 쓰기 요청이 이미 처리 중이거나 실패했습니다.");
    }
  }
  const memoryKey = idempotencyMemoryKey(key);
  const existing = memoryIdempotency.get(memoryKey);
  if (existing?.status === "succeeded" && existing.result) {
    return { replayResult: existing.result };
  }
  if (existing) throw new CloudToolGovernanceError("동일한 외부 쓰기 요청이 이미 처리 중입니다.");
  memoryIdempotency.set(memoryKey, {
    actorHash,
    sessionHash,
    toolId: options.toolId,
    idempotencyKey: options.idempotencyKey,
    inputHash: options.inputHash,
    approvalTokenHash: tokenHash,
    status: "pending",
  });
  return {};
}

export async function finishExternalWrite(options: {
  userId: string;
  toolId: string;
  idempotencyKey: string;
  success: boolean;
  result?: CloudToolResult;
  errorCode?: string;
}): Promise<void> {
  const actorHash = cloudToolActorHash(options.userId);
  const status = options.success ? "succeeded" : "failed";
  const admin = createAdminSupabaseClient();
  if (admin) {
    await admin
      .from("cloud_tool_idempotency")
      .update({
        status,
        result: options.result ?? null,
        error_code: options.errorCode ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("actor_hash", actorHash)
      .eq("tool_id", options.toolId)
      .eq("idempotency_key", options.idempotencyKey);
  }
  const memoryKey = idempotencyMemoryKey({ actorHash, toolId: options.toolId, idempotencyKey: options.idempotencyKey });
  const record = memoryIdempotency.get(memoryKey);
  if (record) {
    record.status = status;
    record.result = options.result;
  }
}

export async function enforceDistributedRateLimit(userId: string, toolId: string): Promise<boolean> {
  const actorHash = cloudToolActorHash(userId);
  const admin = createAdminSupabaseClient();
  if (admin) {
    const { data, error } = await admin.rpc("claim_cloud_tool_rate_limit", {
      p_actor_hash: actorHash,
      p_tool_id: toolId,
      p_limit: MAX_CALLS_PER_MINUTE,
      p_window_seconds: 60,
    });
    if (!error) return data === true;
  }
  const key = `${actorHash}\u0000${toolId}`;
  const cutoff = Date.now() - 60_000;
  const current = (memoryRateWindows.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
  if (current.length >= MAX_CALLS_PER_MINUTE) return false;
  current.push(Date.now());
  memoryRateWindows.set(key, current);
  return true;
}

export async function recordCloudToolAudit(options: {
  requestId: string;
  userId: string;
  toolId: string;
  toolVersion: number;
  effect: CloudToolEffect;
  success: boolean;
  durationMs: number;
  errorCode?: string;
}): Promise<void> {
  const admin = createAdminSupabaseClient();
  if (!admin) return;
  const { error } = await admin.from("cloud_tool_audit").insert({
    request_id: options.requestId,
    actor_hash: cloudToolActorHash(options.userId),
    tool_id: options.toolId,
    tool_version: options.toolVersion,
    effect: options.effect,
    success: options.success,
    duration_ms: options.durationMs,
    error_code: options.errorCode ?? null,
  });
  if (error) console.warn("[coffeeTide] Cloud Tool 영속 감사 기록 실패", error.message);
}
