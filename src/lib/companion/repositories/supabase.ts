// 🗄️ CoffeeTide 로그인 사용자 Supabase 저장소 (Phase 17-A)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §10, §11.1

import {
  CompanionEvent,
  CompanionProfile,
  CompanionMemory,
  CompanionDeletionTombstone,
} from "../contracts";

export interface CompanionRepository {
  getProfile(userId: string, personaId: string): Promise<CompanionProfile>;
  saveProfile(profile: CompanionProfile): Promise<void>;
  recordEvent(event: CompanionEvent): Promise<boolean>;
  getEvents(userId: string, personaId?: string): Promise<CompanionEvent[]>;
  getMemories(userId: string, status?: string): Promise<CompanionMemory[]>;
  saveMemory(memory: CompanionMemory): Promise<void>;
  deleteMemory(userId: string, memoryId: string, keyHash: string): Promise<void>;
  getTombstones(userId: string): Promise<CompanionDeletionTombstone[]>;
}

// 서버 환경에서 동적으로 Supabase Client를 가져오는 헬퍼 (기존 CoffeeTide supabase 서버 클라이언트 규약 준수)
async function getServerSupabase() {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && serviceRoleKey) {
      return createClient(supabaseUrl, serviceRoleKey);
    }
  } catch {
    // fallback
  }
  return null;
}

export class SupabaseCompanionRepository implements CompanionRepository {
  async getProfile(userId: string, personaId: string): Promise<CompanionProfile> {
    const supabase = await getServerSupabase();
    if (!supabase) {
      return {
        userId,
        personaId,
        bondExp: 0,
        relationshipLevel: 1,
        currentMode: "momentum",
        completedTasksCount: 0,
        lastInteractionAt: Date.now(),
        version: 1,
        updatedAt: Date.now(),
      };
    }

    const { data, error } = await supabase
      .from("companion_profiles")
      .select("*")
      .eq("user_id", userId)
      .eq("persona_id", personaId)
      .maybeSingle();

    if (error || !data) {
      return {
        userId,
        personaId,
        bondExp: 0,
        relationshipLevel: 1,
        currentMode: "momentum",
        completedTasksCount: 0,
        lastInteractionAt: Date.now(),
        version: 1,
        updatedAt: Date.now(),
      };
    }

    return {
      userId: data.user_id,
      personaId: data.persona_id,
      bondExp: data.bond_exp,
      relationshipLevel: data.relationship_level,
      currentMode: data.current_mode,
      modeExpiresAt: data.mode_expires_at ? new Date(data.mode_expires_at).getTime() : undefined,
      preferredAddress: data.preferred_address || undefined,
      lastInteractionAt: new Date(data.last_interaction_at).getTime(),
      completedTasksCount: data.completed_tasks_count,
      historyDeletedAt: data.history_deleted_at ? new Date(data.history_deleted_at).getTime() : undefined,
      version: data.version,
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  async saveProfile(profile: CompanionProfile): Promise<void> {
    const supabase = await getServerSupabase();
    if (!supabase) return;

    await supabase.from("companion_profiles").upsert({
      user_id: profile.userId,
      persona_id: profile.personaId,
      bond_exp: profile.bondExp,
      relationship_level: profile.relationshipLevel,
      current_mode: profile.currentMode,
      mode_expires_at: profile.modeExpiresAt ? new Date(profile.modeExpiresAt).toISOString() : null,
      preferred_address: profile.preferredAddress || null,
      last_interaction_at: new Date(profile.lastInteractionAt).toISOString(),
      completed_tasks_count: profile.completedTasksCount,
      history_deleted_at: profile.historyDeletedAt ? new Date(profile.historyDeletedAt).toISOString() : null,
      version: profile.version + 1,
      updated_at: new Date().toISOString(),
    });
  }

  async recordEvent(event: CompanionEvent): Promise<boolean> {
    const supabase = await getServerSupabase();
    if (!supabase) return false;

    // 멱등성 보장 (ON CONFLICT DO NOTHING)
    const { error } = await supabase.from("companion_events").insert({
      id: event.id,
      user_id: event.userId,
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
    });

    if (error) {
      // 멱등 키 충돌(23505)이면 정상적인 무처리(성공)로 응답
      return error.code === "23505";
    }
    return true;
  }

  async getEvents(userId: string, personaId?: string): Promise<CompanionEvent[]> {
    const supabase = await getServerSupabase();
    if (!supabase) return [];

    let query = supabase.from("companion_events").select("*").eq("user_id", userId);
    if (personaId) {
      query = query.eq("persona_id", personaId);
    }

    const { data, error } = await query.order("occurred_at", { ascending: false });
    if (error || !data) return [];

    return data.map((row) => ({
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

  async getMemories(userId: string, status?: string): Promise<CompanionMemory[]> {
    const supabase = await getServerSupabase();
    if (!supabase) return [];

    let query = supabase.from("companion_memories").select("*").eq("user_id", userId);
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error || !data) return [];

    return data.map((row) => ({
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
    const supabase = await getServerSupabase();
    if (!supabase) return;

    await supabase.from("companion_memories").upsert({
      id: memory.id,
      user_id: memory.userId,
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
      version: memory.version + 1,
      updated_at: new Date().toISOString(),
    });
  }

  async deleteMemory(userId: string, memoryId: string, keyHash: string): Promise<void> {
    const supabase = await getServerSupabase();
    if (!supabase) return;

    // 1. 기억 즉시 삭제
    await supabase.from("companion_memories").delete().eq("user_id", userId).eq("id", memoryId);

    // 2. 내용 없는 30일 tombstone 기록
    const tombstone: CompanionDeletionTombstone = {
      userId,
      resourceType: "memory",
      resourceKeyHash: keyHash,
      deletionVersion: Date.now(),
      deletedAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };

    await supabase.from("companion_deletion_tombstones").upsert({
      user_id: tombstone.userId,
      resource_type: tombstone.resourceType,
      resource_key_hash: tombstone.resourceKeyHash,
      deletion_version: tombstone.deletionVersion,
      deleted_at: new Date(tombstone.deletedAt).toISOString(),
      expires_at: new Date(tombstone.expiresAt).toISOString(),
    });
  }

  async getTombstones(userId: string): Promise<CompanionDeletionTombstone[]> {
    const supabase = await getServerSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("companion_deletion_tombstones")
      .select("*")
      .eq("user_id", userId);

    if (error || !data) return [];
    return data.map((row) => ({
      userId: row.user_id,
      resourceType: row.resource_type,
      resourceKeyHash: row.resource_key_hash,
      deletionVersion: Number(row.deletion_version),
      deletedAt: new Date(row.deleted_at).getTime(),
      expiresAt: new Date(row.expires_at).getTime(),
    }));
  }
}
