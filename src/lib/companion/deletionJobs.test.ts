import { describe, expect, it } from "vitest";
import { mapDeletionJobRow } from "./deletionJobs";

describe("Companion deletion job contract", () => {
  it("DB row를 사용자에게 노출할 안전한 삭제 상태로 변환한다", () => {
    const job = mapDeletionJobRow({
      id: "8f529a33-6f73-43ee-a4e2-668541d6d0d5",
      user_id: "816a87d1-e2e6-47ff-a364-67bbf6fd6c83",
      scope: "all",
      persona_id: null,
      status: "completed",
      confirm_token_hash: "must-not-be-exposed",
      deleted_counts: { memories: 2, events: 3 },
      created_at: "2026-09-02T00:00:00.000Z",
      expires_at: "2026-09-02T00:10:00.000Z",
      completed_at: "2026-09-02T00:00:01.000Z",
    });

    expect(job.deletedCounts).toEqual({
      memories: 2,
      events: 3,
      profiles: 0,
      snapshots: 0,
      episodes: 0,
      transitions: 0,
    });
    expect(job).not.toHaveProperty("confirm_token_hash");
  });
});
