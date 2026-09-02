// ⏱️ CoffeeTide 현재 모드(Mode) 판정 엔진 (Phase 17-D)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §5.3, §11.1

import { CompanionCurrentMode, CompanionEvent } from "./contracts";

export interface CurrentModeEvaluation {
  mode: CompanionCurrentMode;
  reason: string;
  recommendedActionNudge?: string;
  suppressActiveNudge: boolean;
}

/**
 * 사용자 상황 및 최근 이벤트로부터 일시적 현재 모드 판정
 */
export function evaluateCurrentMode(params: {
  isFocusTimerActive?: boolean;
  uncompletedTasksCount?: number;
  lastActiveDaysAgo?: number;
  currentHour?: number;
  recentEvents?: CompanionEvent[];
}): CurrentModeEvaluation {
  const currentHour = params.currentHour ?? new Date().getHours();
  const lastActiveDaysAgo = params.lastActiveDaysAgo ?? 0;
  const uncompletedTasksCount = params.uncompletedTasksCount ?? 0;

  // 1. 복귀 모드 (returning)
  if (lastActiveDaysAgo >= 7) {
    return {
      mode: "returning",
      reason: "오랜만에 다시 찾아오셨습니다.",
      recommendedActionNudge: "부담 갖지 마시고 오늘 꼭 필요한 1가지만 가볍게 확인해 봐요.",
      suppressActiveNudge: false,
    };
  }

  // 2. 집중 모드 (focus)
  if (params.isFocusTimerActive) {
    return {
      mode: "focus",
      reason: "몰입 타이머가 진행 중입니다.",
      recommendedActionNudge: "방해 없이 현재 작업에만 몰입할 수 있도록 곁을 지킬게요.",
      suppressActiveNudge: true, // 능동 알림 억제
    };
  }

  // 3. 과부하 모드 (overloaded) - 미완료 업무 과다 또는 심야 작업
  if (uncompletedTasksCount >= 8 || currentHour >= 23 || currentHour < 5) {
    return {
      mode: "overloaded",
      reason: "업무량이 많거나 늦은 시간입니다.",
      recommendedActionNudge: "새로운 업무를 늘리기보다 가장 중요한 1개만 남기고 나머지는 내일로 미뤄볼까요?",
      suppressActiveNudge: true, // 업무 독려 자제, 휴식 권장
    };
  }

  // 4. 회고 모드 (reflection) - 저녁 마감 시간대
  if (currentHour >= 18 && currentHour <= 22) {
    return {
      mode: "reflection",
      reason: "오늘 하루를 마무리할 시간입니다.",
      recommendedActionNudge: "오늘 완수한 일들을 가볍게 돌아보고 편안하게 마감해 보세요.",
      suppressActiveNudge: false,
    };
  }

  // 5. 기본 모멘텀 모드 (momentum)
  return {
    mode: "momentum",
    reason: "순조롭게 업무 흐름을 이어가고 있습니다.",
    recommendedActionNudge: "지금 페이스대로 하나씩 완료해 나가 볼까요?",
    suppressActiveNudge: false,
  };
}
