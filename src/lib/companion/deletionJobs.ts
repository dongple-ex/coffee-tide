export type CompanionDeletionScope = "all" | "persona" | "growth" | "memories";

export interface DeletionJobState {
  jobId: string;
  userId: string;
  scope: CompanionDeletionScope;
  personaId?: string;
  preserveRelationship?: boolean;
  status: "pending" | "in_progress" | "completed" | "failed";
  deletedCounts: {
    memories: number;
    events: number;
    profiles: number;
    snapshots: number;
    episodes: number;
    transitions: number;
  };
  createdAt: number;
  expiresAt: number;
  completedAt?: number;
  errorCode?: string;
}

export function mapDeletionJobRow(row: Record<string, unknown>): DeletionJobState {
  const counts = (row.deleted_counts || {}) as Record<string, unknown>;
  return {
    jobId: String(row.id),
    userId: String(row.user_id),
    scope: row.scope as CompanionDeletionScope,
    personaId: typeof row.persona_id === "string" ? row.persona_id : undefined,
    preserveRelationship:
      row.scope === "growth" ? row.preserve_relationship !== false : undefined,
    status: row.status as DeletionJobState["status"],
    deletedCounts: {
      memories: Number(counts.memories || 0),
      events: Number(counts.events || 0),
      profiles: Number(counts.profiles || 0),
      snapshots: Number(counts.snapshots || 0),
      episodes: Number(counts.episodes || 0),
      transitions: Number(counts.transitions || 0),
    },
    createdAt: new Date(String(row.created_at)).getTime(),
    expiresAt: new Date(String(row.expires_at)).getTime(),
    completedAt: row.completed_at ? new Date(String(row.completed_at)).getTime() : undefined,
    errorCode: typeof row.error_code === "string" ? row.error_code : undefined,
  };
}
