// 🗑️ CoffeeTide 삭제 작업 메모리/인스턴스 스토어 (Phase 17-C)

export interface DeletionJobState {
  jobId: string;
  userId: string;
  scope: "all" | "persona" | "growth" | "memories";
  personaId?: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  deletedCounts: {
    memories: number;
    events: number;
    profiles: number;
    snapshots: number;
  };
  createdAt: number;
  completedAt?: number;
}

export const deletionJobsStore = new Map<string, DeletionJobState>();
