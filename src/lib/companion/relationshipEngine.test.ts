import { describe, it, expect } from "vitest";
import {
  calculateRawLevelFromExp,
  normalizeLegacyImportExp,
  evaluateRelationshipProfile,
  RELATIONSHIP_LEVEL_SPECS,
} from "./relationshipEngine";
import { CompanionEvent } from "./contracts";

describe("Companion Relationship Engine", () => {
  it("5단계 레벨 스펙이 0, 100, 300, 600, 1000 기준으로 정의되어 있다", () => {
    expect(RELATIONSHIP_LEVEL_SPECS[0].minExp).toBe(0);
    expect(RELATIONSHIP_LEVEL_SPECS[1].minExp).toBe(100);
    expect(RELATIONSHIP_LEVEL_SPECS[2].minExp).toBe(300);
    expect(RELATIONSHIP_LEVEL_SPECS[3].minExp).toBe(600);
    expect(RELATIONSHIP_LEVEL_SPECS[4].minExp).toBe(1000);
  });

  it("EXP에 따라 원시 레벨과 진행률이 정확히 계산된다", () => {
    const calc1 = calculateRawLevelFromExp(50);
    expect(calc1.levelSpec.level).toBe(1);
    expect(calc1.progressPercent).toBe(50);

    const calc2 = calculateRawLevelFromExp(150);
    expect(calc2.levelSpec.level).toBe(2);
    expect(calc2.progressPercent).toBe(25); // (150-100)/200

    const calcMax = calculateRawLevelFromExp(1500);
    expect(calcMax.levelSpec.level).toBe(5);
    expect(calcMax.isMaxLevel).toBe(true);
  });

  it("레거시 로컬 EXP는 0~1000 범위로 정규화된다", () => {
    expect(normalizeLegacyImportExp(-50)).toBe(0);
    expect(normalizeLegacyImportExp(450)).toBe(450);
    expect(normalizeLegacyImportExp(5000)).toBe(1000);
  });

  it("한 번에 여러 레벨을 건너뛰지 않고 1단계씩 전이한다", () => {
    // 3일 이상의 이벤트로 500 EXP를 획득한 이벤트 목록
    const events: CompanionEvent[] = [
      {
        id: "e1",
        userId: "u1",
        personaId: "karina",
        eventType: "task_completed",
        authority: "server_domain",
        idempotencyKey: "k1",
        payload: {},
        bondDelta: 200,
        policyVersion: "2026-09-01",
        creditedDay: "2026-09-01",
        creditedTimezone: "Asia/Seoul",
        occurredAt: Date.now(),
        createdAt: Date.now(),
      },
      {
        id: "e2",
        userId: "u1",
        personaId: "karina",
        eventType: "task_completed",
        authority: "server_domain",
        idempotencyKey: "k2",
        payload: {},
        bondDelta: 150,
        policyVersion: "2026-09-01",
        creditedDay: "2026-09-02",
        creditedTimezone: "Asia/Seoul",
        occurredAt: Date.now(),
        createdAt: Date.now(),
      },
      {
        id: "e3",
        userId: "u1",
        personaId: "karina",
        eventType: "task_completed",
        authority: "server_domain",
        idempotencyKey: "k3",
        payload: {},
        bondDelta: 150,
        policyVersion: "2026-09-01",
        creditedDay: "2026-09-03",
        creditedTimezone: "Asia/Seoul",
        occurredAt: Date.now(),
        createdAt: Date.now(),
      },
    ];

    const result = evaluateRelationshipProfile({
      existingProfile: { relationshipLevel: 1, bondExp: 0 },
      events,
    });

    // Lv.1에서 다음 후보인 Lv.2로 1단계만 전이
    expect(result.relationshipLevel).toBe(2);
    expect(result.isLevelUp).toBe(true);
    expect(result.transitionSceneKey).toBe("scene_levelup_1_to_2");
  });
});
