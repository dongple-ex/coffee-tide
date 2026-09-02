// CoffeeTide 로그인 사용자 전용 Companion 저장소
// API route에서 인증한 userId를 생성자에 고정하여 클라이언트 입력으로 소유권이 바뀌지 않게 한다.

import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CompanionEvent,
  CompanionProfile,
  CompanionMemory,
  CompanionDeletionTombstone,
} from "../contracts";

export interface CompanionRepository {
  getProfile(personaId: string): Promise<CompanionProfile>;
  applyEventAndProfile(
    event: CompanionEvent,
    profile: CompanionProfile,
    expectedProfileVersion: number
  ): Promise<{ recorded: boolean; bondDelta: number; profile: CompanionProfile }>;
  getEvents(personaId?: string): Promise<CompanionEvent[]>;
  getMemories(status?: string): Promise<CompanionMemory[]>;
  saveMemory(memory: CompanionMemory): Promise<void>;
  deleteMemory(memoryId: string): Promise<boolean>;
  getTombstones(): Promise<CompanionDeletionTombstone[]>;
}

export class CompanionProfileVersionConflictError extends Error {
  constructor() {
    super("companion_profile_version_conflict");
  }
}

type CompanionProfileRow = {
  user_id: string;
  persona_id: string;
  bond_exp: number;
  relationship_level: number;
  current_mode: CompanionProfile["currentMode"];
  mode_expires_at: string | null;
  preferred_address: string | null;
  last_interaction_at: string;
  completed_tasks_count: number;
  history_deleted_at: string | null;
  version: number;
  updated_at: string;
};

function createDefaultProfile(userId: string, personaId: string): CompanionProfile {
  const now = Date.now();
  return {
    userId,
    personaId,
    bondExp: 0,
    relationshipLevel: 1,
    currentMode: "momentum",
    completedTasksCount: 0,
    lastInteractionAt: now,
    version: 1,
    updatedAt: now,
  };
}

function throwRepositoryError(operation: string, error: { message?: string; code?: string }): never {
  const code = error.code ? ` (${error.code})` : "";
  throw new Error(`Companion repository ${operation} failed${code}: ${error.message || "unknown error"}`);
}

function mapProfileRow(row: CompanionProfileRow): CompanionProfile {
  return {
    userId: row.user_id,
    personaId: row.persona_id,
    bondExp: row.bond_exp,
    relationshipLevel: row.relationship_level,
    currentMode: row.current_mode,
    modeExpiresAt: row.mode_expires_at ? new Date(row.mode_expires_at).getTime() : undefined,
    preferredAddress: row.preferred_address || undefined,
    lastInteractionAt: new Date(row.last_interaction_at).getTime(),
    completedTasksCount: row.completed_tasks_count,
    historyDeletedAt: row.history_deleted_at ? new Date(row.history_deleted_at).getTime() : undefined,
    version: row.version,
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export class SupabaseCompanionRepository implements CompanionRepository {
  constructor(
    private readonly readClient: SupabaseClient,
    private readonly userId: string,
    private readonly writeClient: SupabaseClient = readClient
  ) {
    if (!userId) throw new Error("Companion repository requires an authenticated user");
  }

  private assertOwner(resourceUserId: string) {
    if (resourceUserId !== this.userId) {
      throw new Error("Companion resource ownership mismatch");
    }
  }

  async getProfile(personaId: string): Promise<CompanionProfile> {
    const { data, error } = await this.readClient
      .from("companion_profiles")
      .select("*")
      .eq("user_id", this.userId)
      .eq("persona_id", personaId)
      .maybeSingle();

    if (error) throwRepositoryError("getProfile", error);
    if (!data) return createDefaultProfile(this.userId, personaId);

    return mapProfileRow(data as CompanionProfileRow);
  }

  async applyEventAndProfile(
    event: CompanionEvent,
    profile: CompanionProfile,
    expectedProfileVersion: number
  ): Promise<{ recorded: boolean; bondDelta: number; profile: CompanionProfile }> {
    this.assertOwner(event.userId);
    this.assertOwner(profile.userId);
    const { data, error } = await this.writeClient.rpc("apply_companion_event_and_profile", {
      p_user_id: this.userId,
      p_expected_profile_version: expectedProfileVersion,
      p_event: {
        id: event.id,
        persona_id: event.personaId,
        event_type: event.eventType,
        authority: event.authority,
        source_item_id: event.sourceItemId || null,
        source_version: event.sourceVersion || null,
        source_receipt_id: event.sourceReceiptId || null,
        idempotency_key: event.idempotencyKey,
        payload: event.payload,
        bond_delta: event.bondDelta,
        policy_version: event.policyVersion,
        credited_day: event.creditedDay,
        credited_timezone: event.creditedTimezone,
        occurred_at: new Date(event.occurredAt).toISOString(),
      },
      p_profile: {
        persona_id: profile.personaId,
        bond_exp: profile.bondExp,
        relationship_level: profile.relationshipLevel,
        current_mode: profile.currentMode,
        mode_expires_at: profile.modeExpiresAt
          ? new Date(profile.modeExpiresAt).toISOString()
          : null,
        preferred_address: profile.preferredAddress || null,
        last_interaction_at: new Date(profile.lastInteractionAt).toISOString(),
        completed_tasks_count: profile.completedTasksCount,
        history_deleted_at: profile.historyDeletedAt
          ? new Date(profile.historyDeletedAt).toISOString()
          : null,
      },
    });
    if (error) {
      if (error.message?.includes("companion_profile_version_conflict")) {
        throw new CompanionProfileVersionConflictError();
      }
      throwRepositoryError("applyEventAndProfile", error);
    }
    const result = data as {
      recorded: boolean;
      bond_delta: number;
      profile: CompanionProfileRow;
    };
    return {
      recorded: result.recorded,
      bondDelta: Number(result.bond_delta || 0),
      profile: mapProfileRow(result.profile),
    };
  }

  async getEvents(personaId?: string): Promise<CompanionEvent[]> {
    let query = this.readClient.from("companion_events").select("*").eq("user_id", this.userId);
    if (personaId) query = query.eq("persona_id", personaId);

    const { data, error } = await query.order("occurred_at", { ascending: false });
    if (error) throwRepositoryError("getEvents", error);

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      personaId: row.persona_id,
      eventType: row.event_type,
      authority: row.authority,
      sourceItemId: row.source_item_id || undefined,
      sourceVersion: row.source_version || undefined,
      sourceReceiptId: row.source_receipt_id || undefined,
      idempotencyKey: row.idempotency_key,
      payload: row.payload || {},
      bondDelta: row.bond_delta,
      policyVersion: row.policy_version,
      creditedDay: row.credited_day,
      creditedTimezone: row.credited_timezone,
      occurredAt: new Date(row.occurred_at).getTime(),
      createdAt: new Date(row.created_at).getTime(),
    }));
  }

  async getMemories(status?: string): Promise<CompanionMemory[]> {
    let query = this.readClient.from("companion_memories").select("*").eq("user_id", this.userId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throwRepositoryError("getMemories", error);

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      personaScope: row.persona_scope,
      memoryType: row.memory_type,
      contentText: row.content_text,
      contentJson: row.content_json || undefined,
      status: row.status,
      confidence: Number(row.confidence),
      userConfirmed: row.user_confirmed,
      sensitivity: row.sensitivity,
      sourceRefs: row.source_refs || [],
      expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
      lastRecalledAt: row.last_recalled_at ? new Date(row.last_recalled_at).getTime() : undefined,
      recallCount: row.recall_count,
      version: row.version,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    }));
  }

  async saveMemory(memory: CompanionMemory): Promise<void> {
    this.assertOwner(memory.userId);
    const { error } = await this.writeClient.from("companion_memories").upsert({
      id: memory.id,
      user_id: this.userId,
      persona_scope: memory.personaScope,
      memory_type: memory.memoryType,
      content_text: memory.contentText,
      content_json: memory.contentJson || null,
      status: memory.status,
      confidence: memory.confidence,
      user_confirmed: memory.userConfirmed,
      sensitivity: memory.sensitivity,
      source_refs: memory.sourceRefs,
      expires_at: memory.expiresAt ? new Date(memory.expiresAt).toISOString() : null,
      last_recalled_at: memory.lastRecalledAt ? new Date(memory.lastRecalledAt).toISOString() : null,
      recall_count: memory.recallCount,
      version: memory.version,
      updated_at: new Date(memory.updatedAt).toISOString(),
    });
    if (error) throwRepositoryError("saveMemory", error);
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    const keyHash = `sha256_${createHash("sha256")
      .update(`${this.userId}:${memoryId}`)
      .digest("hex")}`;
    const { data, error } = await this.writeClient.rpc("delete_companion_memory", {
      p_user_id: this.userId,
      p_memory_id: memoryId,
      p_key_hash: keyHash,
    });
    if (error) throwRepositoryError("deleteMemory", error);
    return data === true;
  }

  async getTombstones(): Promise<CompanionDeletionTombstone[]> {
    const { data, error } = await this.readClient
      .from("companion_deletion_tombstones")
      .select("*")
      .eq("user_id", this.userId);
    if (error) throwRepositoryError("getTombstones", error);

    return (data || []).map((row) => ({
      userId: row.user_id,
      resourceType: row.resource_type,
      resourceKeyHash: row.resource_key_hash,
      deletionVersion: Number(row.deletion_version),
      deletedAt: new Date(row.deleted_at).getTime(),
      expiresAt: new Date(row.expires_at).getTime(),
    }));
  }
}
