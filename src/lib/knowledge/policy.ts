import type { WorkspaceItem } from "../data/contracts";

/**
 * 항목이 클라우드 외부 AI(예: Gemini)로 전송 가능한지 정책을 검사합니다.
 * local_only이거나 aiPolicy가 disabled 또는 local_only인 경우 false를 반환합니다.
 */
export function canItemBeSentToCloudAi(item: WorkspaceItem): boolean {
  if (item.deletedAt) return false;
  if (item.privacyScope === "local_only") return false;
  if (item.aiPolicy !== "cloud_allowed") return false;
  return true;
}

/**
 * 항목이 로컬/클라우드 검색 인덱싱 대상이 될 수 있는지 검사합니다.
 */
export function canItemBeIndexed(item: WorkspaceItem): boolean {
  if (item.deletedAt) return false;
  if (item.aiPolicy === "disabled") return false;
  return true;
}

/**
 * 실행 정책(executionPolicy)에 따라 전송 가능한 항목만 안전하게 필터링합니다.
 */
export function filterItemsByExecutionPolicy(
  items: WorkspaceItem[],
  executionPolicy: "local_only" | "local_first" | "cloud_allowed"
): { allowed: WorkspaceItem[]; excludedCount: number } {
  let excludedCount = 0;
  const allowed: WorkspaceItem[] = [];

  for (const item of items) {
    if (item.deletedAt || item.aiPolicy === "disabled") {
      excludedCount++;
      continue;
    }

    if (executionPolicy === "cloud_allowed") {
      if (canItemBeSentToCloudAi(item)) {
        allowed.push(item);
      } else {
        excludedCount++;
      }
    } else {
      // local_only 또는 local_first인 경우 local_only 데이터도 로컬 검색 범위에 포함
      allowed.push(item);
    }
  }

  return { allowed, excludedCount };
}
