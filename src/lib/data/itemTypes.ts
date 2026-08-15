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
