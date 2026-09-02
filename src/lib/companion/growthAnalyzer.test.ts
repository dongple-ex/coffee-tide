import { describe, it, expect } from "vitest";
import { analyzeUserGrowth } from "./growthAnalyzer";
import { evaluateCurrentMode } from "./modeEngine";
import { CompanionEvent } from "./contracts";

describe("Companion Growth & Mode Engines (Phase 17-D)", () => {
  it("표본이 3건 미만일 때 isSampleSufficient=false로 판정하고 단정을 피한다", () => {
    const events: CompanionEvent[] = [
      {
        id: "e1",
        userId: "u1",
        personaId: "karina",
        eventType: "task_completed",
        authority: "server_domain",
        idempotencyKey: "k1",
        payload: {},
        bondDelta: 6,
        policyVersion: "2026-09-01",
        creditedDay: "2026-09-01",
        creditedTimezone: "Asia/Seoul",
        occurredAt: Date.now(),
        createdAt: Date.now(),
      },
    ];

    const snapshot = analyzeUserGrowth(events);
    expect(snapshot.metrics.isSampleSufficient).toBe(false);
    expect(snapshot.insights[0]).toContain("표본이 부족하여");
  });

  it("충분한 표본이 있을 때 4축 지표와 실험 제안이 생성된다", () => {
    const now = Date.now();
    const events: CompanionEvent[] = [
      {
        id: "e1",
        userId: "u1",
        personaId: "karina",
        eventType: "task_completed",
        authority: "server_domain",
        idempotencyKey: "k1",
        payload: {},
        bondDelta: 6,
        policyVersion: "2026-09-01",
        creditedDay: "2026-09-01",
        creditedTimezone: "Asia/Seoul",
        occurredAt: now,
        createdAt: now,
      },
      {
        id: "e2",
        userId: "u1",
        personaId: "karina",
        eventType: "focus_session_completed",
        authority: "server_domain",
        idempotencyKey: "k2",
        payload: {},
        bondDelta: 6,
        policyVersion: "2026-09-01",
        creditedDay: "2026-09-01",
        creditedTimezone: "Asia/Seoul",
        occurredAt: now,
        createdAt: now,
      },
      {
        id: "e3",
        userId: "u1",
        personaId: "karina",
        eventType: "artifact_accepted",
        authority: "server_domain",
        idempotencyKey: "k3",
        payload: {},
        bondDelta: 8,
        policyVersion: "2026-09-01",
        creditedDay: "2026-09-01",
        creditedTimezone: "Asia/Seoul",
        occurredAt: now,
        createdAt: now,
      },
      {
        id: "e4",
        userId: "u1",
        personaId: "karina",
        eventType: "daily_reflection_saved",
        authority: "server_domain",
        idempotencyKey: "k4",
        payload: {},
        bondDelta: 8,
        policyVersion: "2026-09-01",
        creditedDay: "2026-09-01",
        creditedTimezone: "Asia/Seoul",
        occurredAt: now,
        createdAt: now,
      },
    ];

    const snapshot = analyzeUserGrowth(events);
    expect(snapshot.metrics.isSampleSufficient).toBe(true);
    expect(snapshot.experiment).toBeDefined();
    expect(snapshot.metrics.executionScore).toBe(12);
    expect(snapshot.metrics.focusScore).toBe(18);
  });

  it("과부하(overloaded) 상황에서는 능동 개입을 억제하고 휴식/축소를 권장한다", () => {
    const evaluation = evaluateCurrentMode({
      uncompletedTasksCount: 12,
      currentHour: 14,
    });

    expect(evaluation.mode).toBe("overloaded");
    expect(evaluation.suppressActiveNudge).toBe(true);
    expect(evaluation.recommendedActionNudge).toContain("내일로 미뤄볼까요");
  });

  it("7일 이상 미접속 후 복귀 시 returning 모드로 판정된다", () => {
    const evaluation = evaluateCurrentMode({
      lastActiveDaysAgo: 10,
    });

    expect(evaluation.mode).toBe("returning");
    expect(evaluation.recommendedActionNudge).toContain("부담 갖지 마시고");
  });
});
