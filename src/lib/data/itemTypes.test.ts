import { describe, expect, it } from "vitest";
import type { UnifiedData } from "../types/unified";
import type { WorkspaceItem } from "./contracts";
import { isCompletedToday, isWorkflowTask } from "./itemTypes";

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

  it("오늘 완료 판별(isCompletedToday)은 당일 완료 항목만 집계하고 과거 완료 항목은 제외한다", () => {
    const nowMs = new Date("2026-11-10T12:00:00+09:00").getTime();

    const completedTodayWithTimestamp: UnifiedData = {
      ...legacyItem,
      id: "done-today-1",
      created_at: "2026-11-05T09:00:00+09:00",
      status: "completed",
      completedAt: "2026-11-10T10:30:00+09:00",
    };

    const completedYesterdayWithTimestamp: UnifiedData = {
      ...legacyItem,
      id: "done-yesterday-1",
      created_at: "2026-11-08T09:00:00+09:00",
      status: "completed",
      completedAt: "2026-11-09T18:00:00+09:00",
    };

    const legacyCompletedOld: UnifiedData = {
      ...legacyItem,
      id: "legacy-old-done",
      created_at: "2026-10-01T09:00:00+09:00",
      status: "completed",
    };

    const legacyCompletedToday: UnifiedData = {
      ...legacyItem,
      id: "legacy-today-done",
      created_at: "2026-11-10T08:15:00+09:00",
      status: "completed",
    };

    expect(isCompletedToday(completedTodayWithTimestamp, nowMs)).toBe(true);
    expect(isCompletedToday(completedYesterdayWithTimestamp, nowMs)).toBe(false);
    expect(isCompletedToday(legacyCompletedOld, nowMs)).toBe(false);
    expect(isCompletedToday(legacyCompletedToday, nowMs)).toBe(true);
  });
});
