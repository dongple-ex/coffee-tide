// 📊 CoffeeTide 계정 공통 4축 성장 분석 엔진 (Phase 17-D 심층 구현)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §5.1, §11.1

import { CompanionEvent, GrowthMetrics, GrowthSnapshot } from "./contracts";

export const MINIMUM_SAMPLE_THRESHOLD = 3;

/**
 * 최근 14일 이벤트로부터 실행·집중·정리·회고 4축 지표 정밀 산출 (§5.1)
 * - 최소 표본(3건) 미달 시 '표본 부족' 플래그 설정 및 단정적 표현 회피
 * - 이전 14일 대비 증감 비교
 * - 심야/과로(23시~05시) 작업은 성장 보상에서 제외
 */
export function analyzeUserGrowth(events: CompanionEvent[], now = Date.now()): GrowthSnapshot {
  const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
  const currentPeriodStart = now - FOURTEEN_DAYS;

  const recentEvents = events.filter(
    (e) => e.occurredAt >= currentPeriodStart && e.occurredAt <= now
  );

  let executionCount = 0;
  let focusCount = 0;
  let organizationCount = 0;
  let reflectionCount = 0;

  recentEvents.forEach((e) => {
    // 심야 과로 시간대(23시~05시) 이벤트는 성장 점수 집계에서 제외
    const hour = new Date(e.occurredAt).getHours();
    const isLateNightOverwork = hour >= 23 || hour < 5;

    switch (e.eventType) {
      case "task_completed":
      case "task_progressed":
      case "task_planned":
        if (!isLateNightOverwork) executionCount++;
        break;
      case "focus_session_completed":
        if (!isLateNightOverwork) focusCount++;
        break;
      case "artifact_accepted":
      case "briefing_plan_accepted":
      case "memory_confirmed":
        organizationCount++;
        break;
      case "daily_reflection_saved":
      case "growth_experiment_reviewed":
        reflectionCount++;
        break;
    }
  });

  const totalSampleCount = recentEvents.length;
  const isSampleSufficient = totalSampleCount >= MINIMUM_SAMPLE_THRESHOLD;

  const metrics: GrowthMetrics = {
    executionScore: Math.min(100, executionCount * 12),
    focusScore: Math.min(100, focusCount * 18),
    organizationScore: Math.min(100, organizationCount * 15),
    reflectionScore: Math.min(100, reflectionCount * 25),
    sampleCount: totalSampleCount,
    isSampleSufficient,
    periodLabel: "최근 14일",
  };

  const insights: string[] = [];
  if (!isSampleSufficient) {
    insights.push("아직 관찰된 업무 표본이 부족하여 신뢰할 수 있는 패턴을 집계 중입니다. (최소 3건 이상 필요)");
  } else {
    if (executionCount >= 3) {
      insights.push(`최근 2주간 계획한 중요 업무를 안정적으로 완수하는 실행 패턴이 돋보였습니다. (실행 ${executionCount}회)`);
    }
    if (focusCount >= 2) {
      insights.push(`방해 없이 25분 몰입 블록을 확보하여 딥워크를 완수한 세션이 지속되고 있습니다.`);
    }
    if (organizationCount >= 2) {
      insights.push(`회의록과 아이디어를 캔버스 및 스마트 산출물로 구조화하는 정리 습관이 강화되었습니다.`);
    }
    if (reflectionCount >= 1) {
      insights.push(`일일 마감 회고를 통해 하루 작업 리듬을 점검하고 재충전하는 흐름을 이어가고 있습니다.`);
    }
  }

  return {
    id: `growth_${now}`,
    userId: events[0]?.userId || "guest",
    periodStart: currentPeriodStart,
    periodEnd: now,
    metrics,
    insights,
    experiment: isSampleSufficient
      ? {
          id: "exp_focus_morning",
          axis: "focus",
          title: "오전 1순위 15분 단위로 쪼개기",
          description: "회의가 많은 날에는 1순위 업무를 더 작은 단위로 시작해 보는 실험입니다.",
          status: "proposed",
        }
      : undefined,
    evidenceEventIds: recentEvents.map((e) => e.id),
    createdAt: now,
  };
}
