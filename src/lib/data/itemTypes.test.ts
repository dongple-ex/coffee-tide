import { describe, expect, it } from "vitest";
import type { UnifiedData } from "../types/unified";
import type { WorkspaceItem } from "./contracts";
import { isWorkflowTask } from "./itemTypes";

const legacyItem: UnifiedData = {
  id: "legacy",
  source: "manual",
  title: "기존 업무",
  content: "",
  created_at: "2026-08-15T00:00:00.000Z",
  author: { name: "User" },
  url: "",
  status: "pending",
};

function workspaceItem(itemType: WorkspaceItem["itemType"]): WorkspaceItem {
  return {
    ...legacyItem,
    id: itemType,
    itemType,
    version: 1,
    privacyScope: "cloud_private",
    aiPolicy: "cloud_allowed",
    updatedAt: legacyItem.created_at,
  };
}

describe("isWorkflowTask", () => {
  it("기존 itemType 미지정 항목은 업무 호환성을 유지한다", () => {
    expect(isWorkflowTask(legacyItem)).toBe(true);
  });

  it("task만 업무 통계에 포함한다", () => {
    expect(isWorkflowTask(workspaceItem("task"))).toBe(true);
    expect(isWorkflowTask(workspaceItem("expense"))).toBe(false);
    expect(isWorkflowTask(workspaceItem("voice"))).toBe(false);
    expect(isWorkflowTask(workspaceItem("document"))).toBe(false);
  });
});
