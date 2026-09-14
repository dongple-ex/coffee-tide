import { describe, expect, it } from "vitest";
import type { WorkspaceItem } from "../data/contracts";
import { workspaceDbName } from "../browser/workspaceDb";
import type { SyncConflict } from "./contracts";
import { buildConflictResolutionPlan } from "./conflictResolution";

const baseItem: WorkspaceItem = {
  id: "task-1",
  source: "manual",
  title: "업무 기획서",
  content: "로컬 내용",
  created_at: "2026-08-14T08:00:00.000Z",
  author: { name: "User" },
  url: "",
  status: "pending",
  version: 1,
  itemType: "task",
  privacyScope: "cloud_private",
  aiPolicy: "cloud_allowed",
  updatedAt: "2026-08-14T08:00:00.000Z",
};

function conflict(serverPatch: Partial<WorkspaceItem> = {}): SyncConflict {
  return {
    itemId: baseItem.id,
    localItem: { ...baseItem, content: "이 기기 수정 내용" },
    serverItem: { ...baseItem, content: "클라우드 수정 내용", ...serverPatch },
    detectedAt: "2026-08-14T09:00:00.000Z",
    resolved: false,
  };
}

describe("sync conflict resolution", () => {
  const now = "2026-08-14T10:00:00.000Z";

  it("keeps the local item at the next optimistic version", () => {
    const result = buildConflictResolutionPlan(
      [baseItem],
      "keep_local",
      conflict({ version: 4 }),
      { now, copyId: "unused" }
    );

    expect(result.items[0]).toMatchObject({ version: 5, updatedAt: now, deletedAt: undefined });
    expect(result.mutation).toMatchObject({ operation: "update", baseVersion: 4 });
  });

  it("applies a cloud tombstone when the server version is selected", () => {
    const result = buildConflictResolutionPlan(
      [baseItem],
      "keep_server",
      conflict({ version: 2, deletedAt: now }),
      { now, copyId: "unused" }
    );

    expect(result.items).toHaveLength(0);
    expect(result.mutation).toBeUndefined();
  });

  it("keeps the cloud item and creates one bounded local copy", () => {
    const result = buildConflictResolutionPlan(
      [baseItem],
      "keep_both",
      conflict({ version: 3 }),
      { now, copyId: "sync-copy-safe-id" }
    );

    expect(result.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([baseItem.id, "sync-copy-safe-id"])
    );
    expect(result.mutation).toMatchObject({ itemId: "sync-copy-safe-id", operation: "create" });
    expect(result.items.find((item) => item.id === "sync-copy-safe-id")?.attributes).toMatchObject({
      conflictSourceId: baseItem.id,
    });
  });

  it("isolates guest and signed-in IndexedDB databases", () => {
    expect(workspaceDbName("guest")).toBe("coffeeTide_workspace_db");
    expect(workspaceDbName("guest")).not.toBe(workspaceDbName("usr_alice"));
    expect(workspaceDbName("usr_alice")).not.toBe(workspaceDbName("usr_bob"));
  });
});
