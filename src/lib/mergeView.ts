// 병합 파이프라인 (00-product-spec §4.3) — 수동+외부 병합 → 규칙 → 팔로업 에스컬레이션.
//
// 이 계산은 순수하다(입력만으로 결과가 정해진다). 대시보드 렌더링과 분리해 두면
// 정렬·에스컬레이션 규칙을 화면 없이 검증할 수 있다.

import { applyRules, AutomationRule, ProcessedData } from "@/lib/automation/rules";
import { isWithinDays, pickWindowDays, ViewWindowSetting } from "@/lib/collectWindow";
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
  followupHours: number,
  nowTimestamp?: number,
  viewWindow: ViewWindowSetting = "auto"
): ViewItem[] {
  const manualIds = new Set(manualItems.map((i) => i.id));
  const all = [...manualItems, ...serverMails.filter((m) => !manualIds.has(m.id))];
  const visible = all.filter((i) => !dismissed.includes(i.id));
  const processed = applyRules(visible, rules);

  const now = nowTimestamp ?? Date.now();
  const withOverdue: ViewItem[] = processed.map((i) => {
    const hours = Math.floor((now - Date.parse(i.created_at)) / 3_600_000);
    const overdue =
      RESPONSE_NEEDED.has(i.category ?? "") && i.status !== "completed" && hours >= followupHours
        ? hours
        : 0;
    return { ...i, overdue };
  });

  // 표시 창 (collectWindow.ts §2) — 설정이 "auto"면 외부 항목 건수에 따라 3/7/14일
  // 자동 선택, 숫자면 그 일수로 고정. 수동 항목·핀 고정·팔로업 초과 항목은 창과
  // 무관하게 유지한다 — 창이 좁아진다고 방치 업무(에스컬레이션 대상)가 화면에서
  // 사라지면 팔로업 기능이 무력화된다.
  const external = withOverdue.filter((i) => !manualIds.has(i.id));
  const windowDays = viewWindow === "auto" ? pickWindowDays(external, now) : viewWindow;
  const kept = withOverdue.filter(
    (i) =>
      manualIds.has(i.id) ||
      i.pinned ||
      i.overdue > 0 ||
      isWithinDays(i.created_at, windowDays, now)
  );

  // 정렬: pin 고정 → 팔로업 에스컬레이션 → 나머지(원래 순서)
  const pinned = kept.filter((i) => i.pinned);
  const escalated = kept.filter((i) => !i.pinned && i.overdue > 0);
  const rest = kept.filter((i) => !i.pinned && i.overdue === 0);
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
