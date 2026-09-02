import { describe, it, expect } from "vitest";
import {
  buildCompanionIdempotencyKey,
  createCompanionDomainEvent,
  calculateCreditedDay,
} from "./eventLedger";

describe("Companion Event Ledger & Trust Boundaries (Phase 17-A)", () => {
  it("동일 항목 완료에 대해 항상 동일한 멱등 키가 생성된다", () => {
    const key1 = buildCompanionIdempotencyKey({
      eventType: "task_completed",
      itemId: "item_123",
    });
    const key2 = buildCompanionIdempotencyKey({
      eventType: "task_completed",
      itemId: "item_123",
    });
    expect(key1).toBe("v1:task_completed:item:item_123");
    expect(key1).toBe(key2);
  });

  it("Mock 또는 Sample 데이터는 EXP 보상이 0으로 처리된다", () => {
    const event = createCompanionDomainEvent({
      userId: "user_1",
      personaId: "karina",
      eventType: "task_completed",
      authority: "server_domain",
      sourceItemId: "mock_item_1",
      payload: { isMock: true, isImportant: true },
    });

    expect(event.bondDelta).toBe(0);
    expect(event.payload.bondIgnoredReason).toBe("mock_or_sample_data");
  });

  it("계획된 중요 업무 최초 완료 시 +12 EXP가 부여된다", () => {
    const event = createCompanionDomainEvent({
      userId: "user_1",
      personaId: "karina",
      eventType: "task_completed",
      authority: "server_domain",
      sourceItemId: "item_real_1",
      payload: { isPlanned: true, isImportant: true },
    });

    expect(event.bondDelta).toBe(12);
  });

  it("일반 업무 완료 시 +6 EXP가 부여된다", () => {
    const event = createCompanionDomainEvent({
      userId: "user_1",
      personaId: "karina",
      eventType: "task_completed",
      authority: "server_domain",
      sourceItemId: "item_normal_1",
      payload: {},
    });

    expect(event.bondDelta).toBe(6);
  });

  it("하루 최대 총합 EXP(60)를 초과하여 지급되지 않는다", () => {
    const existingEvents = [
      createCompanionDomainEvent({
        userId: "user_1",
        personaId: "karina",
        eventType: "growth_experiment_reviewed",
        authority: "server_domain",
        payload: {},
      }),
      createCompanionDomainEvent({
        userId: "user_1",
        personaId: "karina",
        eventType: "artifact_accepted",
        authority: "server_domain",
        payload: {},
      }),
    ];
    existingEvents[0].bondDelta = 35;
    existingEvents[1].bondDelta = 20; // 합계 55

    // 12 EXP짜리 업무 완료 시도 -> 남은 한도인 5만 지급되어야 함
    const nextEvent = createCompanionDomainEvent({
      userId: "user_1",
      personaId: "karina",
      eventType: "task_completed",
      authority: "server_domain",
      sourceItemId: "item_real_2",
      payload: { isPlanned: true, isImportant: true },
      existingDayEvents: existingEvents,
    });

    expect(nextEvent.bondDelta).toBe(5);
  });

  it("타임존(Asia/Seoul)에 따라 credited_day가 올바르게 계산된다", () => {
    // 2026-09-01 02:00 UTC = 2026-09-01 11:00 KST
    const ts = new Date("2026-09-01T02:00:00Z").getTime();
    const day = calculateCreditedDay(ts, "Asia/Seoul");
    expect(day).toBe("2026-09-01");
  });

  it("성장 실험 회고는 실험 ID별로 서로 다른 멱등 키를 사용한다", () => {
    const first = createCompanionDomainEvent({
      userId: "user_1",
      personaId: "karina",
      eventType: "growth_experiment_reviewed",
      authority: "server_domain",
      payload: { experimentId: "exp_focus_morning" },
    });
    const second = createCompanionDomainEvent({
      userId: "user_1",
      personaId: "karina",
      eventType: "growth_experiment_reviewed",
      authority: "server_domain",
      payload: { experimentId: "exp_reflection_evening" },
    });

    expect(first.idempotencyKey).toBe("v1:growth_review:period:exp_focus_morning");
    expect(second.idempotencyKey).toBe("v1:growth_review:period:exp_reflection_evening");
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });
});
