import type { WorkspaceItem } from "./contracts";
import type { UnifiedData } from "../types/unified";

/**
 * 기존 데이터에는 itemType이 없으므로 업무로 간주합니다.
 * 구조화 비용·문서·음성 항목이 업무 건수와 알림에 섞이지 않게 하는 공통 판별식입니다.
 */
export function isWorkflowTask(item: UnifiedData | WorkspaceItem): boolean {
  const itemType = (item as Partial<WorkspaceItem>).itemType;
  return itemType === undefined || itemType === "task";
}

function isSameLocalCalendarDay(isoTimestamp: string | undefined, nowMs: number): boolean {
  if (!isoTimestamp) return false;
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) return false;
  return new Date(parsed).toDateString() === new Date(nowMs).toDateString();
}

/**
 * 오늘 완료한 업무인지 판별합니다.
 * completedAt이 있으면 completedAt이 로컬 기준 오늘 날짜인지 확인하고,
 * 구 버전 항목처럼 completedAt이 없으면 created_at이 오늘 날짜인 경우만 당일 완료로 집계합니다.
 */
export function isCompletedToday(
  item: UnifiedData | WorkspaceItem,
  nowMs: number = Date.now()
): boolean {
  if (!isWorkflowTask(item) || item.status !== "completed") return false;
  const candidate = item as Partial<WorkspaceItem>;
  const attrCompletedAt =
    candidate.attributes && typeof candidate.attributes.completedAt === "string"
      ? candidate.attributes.completedAt
      : undefined;
  const completedAt = item.completedAt ?? attrCompletedAt;
  if (completedAt) {
    return isSameLocalCalendarDay(completedAt, nowMs);
  }
  return isSameLocalCalendarDay(item.created_at, nowMs);
}
