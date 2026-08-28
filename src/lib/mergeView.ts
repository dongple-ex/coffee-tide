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

export type WorkflowSection = "todo" | "rest";

/**
 * 완료 처리로 카드가 다른 섹션으로 이동하지 않도록 섹션은 카테고리로만 정한다.
 * 상태 변경은 같은 카드 자리에서 스타일과 액션만 갱신한다.
 */
export function getWorkflowSection(
  item: Pick<UnifiedData, "category" | "status">
): WorkflowSection {
  return TODO_CATS.has(item.category ?? "") ? "todo" : "rest";
}

export function buildMergedView(
  manualItems: UnifiedData[],
  serverMails: UnifiedData[],
  dismissed: string[],
  rules: AutomationRule[],
  followupHours: number,
  nowTimestamp?: number,
  viewWindow: ViewWindowSetting = "auto"
): ViewItem[] {
  const manualMap = new Map(manualItems.map((i) => [i.id, i]));
  const dismissedIds = new Set(dismissed);

  // 외부 항목이 manualItems에 의해 상태/속성이 덮어써진 경우(local override),
  // 원래 있던 외부 항목의 위치(순서)를 그대로 유지하면서 내용만 덮어쓴다.
  const serverIds = new Set(serverMails.map((s) => s.id));
  const pureManual = manualItems.filter((i) => !serverIds.has(i.id));
  const pureManualIds = new Set(pureManual.map((i) => i.id));
  const mergedServer = serverMails.map((s) => manualMap.get(s.id) ?? s);

  const all = [...pureManual, ...mergedServer];
  const visible = all.filter((i) => !dismissedIds.has(i.id));
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
  const external = withOverdue.filter((i) => !pureManualIds.has(i.id));
  const windowDays = viewWindow === "auto" ? pickWindowDays(external, now) : viewWindow;
  const kept = withOverdue.filter(
    (i) =>
      pureManualIds.has(i.id) ||
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
