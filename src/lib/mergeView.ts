// 병합 파이프라인 (00-product-spec §4.3) — 수동+외부 병합 → 규칙 → 팔로업 에스컬레이션.
//
// 이 계산은 순수하다(입력만으로 결과가 정해진다). 대시보드 렌더링과 분리해 두면
// 정렬·에스컬레이션 규칙을 화면 없이 검증할 수 있다.

import { applyRules, AutomationRule, ProcessedData } from "@/lib/automation/rules";
import { UnifiedData } from "@/lib/types/unified";

export type ViewItem = ProcessedData & { overdue: number };

/** 사람의 응답이 필요한 카테고리 — 팔로업 에스컬레이션 대상 */
export const RESPONSE_NEEDED = new Set(["urgent", "approval_required", "action_required"]);

/** "오늘의 행동 지침" 섹션에 노출할 카테고리 */
export const TODO_CATS = new Set(["urgent", "approval_required", "action_required", "meeting"]);

export function buildMergedView(
  manualItems: UnifiedData[],
  serverMails: UnifiedData[],
  dismissed: string[],
  rules: AutomationRule[],
  followupHours: number
): ViewItem[] {
  const manualIds = new Set(manualItems.map((i) => i.id));
  const all = [...manualItems, ...serverMails.filter((m) => !manualIds.has(m.id))];
  const visible = all.filter((i) => !dismissed.includes(i.id));
  const processed = applyRules(visible, rules);

  const now = Date.now();
  const withOverdue: ViewItem[] = processed.map((i) => {
    const hours = Math.floor((now - Date.parse(i.created_at)) / 3_600_000);
    const overdue =
      RESPONSE_NEEDED.has(i.category ?? "") && i.status !== "completed" && hours >= followupHours
        ? hours
        : 0;
    return { ...i, overdue };
  });

  // 정렬: pin 고정 → 팔로업 에스컬레이션 → 나머지(원래 순서)
  const pinned = withOverdue.filter((i) => i.pinned);
  const escalated = withOverdue.filter((i) => !i.pinned && i.overdue > 0);
  const rest = withOverdue.filter((i) => !i.pinned && i.overdue === 0);
  return [...pinned, ...escalated, ...rest];
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
