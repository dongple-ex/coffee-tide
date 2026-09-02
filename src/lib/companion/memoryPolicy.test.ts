import { describe, it, expect } from "vitest";
import {
  evaluateMemoryCandidate,
  checkMemoryRetentionStatus,
  generateMemoryKeyHash,
} from "./memoryPolicy";
import { CompanionMemory } from "./contracts";

describe("Companion Memory Policy Engine (Phase 17-C)", () => {
  it("민감 정보가 포함된 텍스트는 자동으로 후보 등록이 차단된다", () => {
    const result = evaluateMemoryCandidate("요즘 대출 빚 때문에 너무 힘들고 우울해");
    expect(result.isEligible).toBe(false);
    expect(result.sensitivity).toBe("restricted");
    expect(result.rejectReason).toBe("sensitive_information_blocked");
  });

  it("호칭과 표현 선호는 적합한 기억 후보로 분류된다", () => {
    const result = evaluateMemoryCandidate("팀장님이라고 불러줘");
    expect(result.isEligible).toBe(true);
    expect(result.type).toBe("preference");
    expect(result.requiresConfirmation).toBe(false); // 호칭은 즉시 저장 가능
  });

  it("작업 방식과 약속은 사용자 확인 필수(requiresConfirmation=true)로 등록된다", () => {
    const result = evaluateMemoryCandidate("금요일마다 오후 4시에 주간 회고를 하고 싶어");
    expect(result.isEligible).toBe(true);
    expect(result.type).toBe("work_style");
    expect(result.requiresConfirmation).toBe(true);
  });

  it("14일이 지난 미확인 후보는 만료(isExpired=true)된다", () => {
    const oldCandidate: CompanionMemory = {
      id: "mem_old",
      userId: "u1",
      personaScope: "shared",
      memoryType: "work_style",
      contentText: "오전 집중 선호",
      status: "candidate",
      confidence: 0.7,
      userConfirmed: false,
      sensitivity: "normal",
      sourceRefs: [],
      recallCount: 0,
      version: 1,
      createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
      updatedAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
    };

    const status = checkMemoryRetentionStatus(oldCandidate);
    expect(status.isExpired).toBe(true);
  });

  it("결정론적 key hash가 올바르게 생성된다", () => {
    const h1 = generateMemoryKeyHash("u1", "mem_123");
    const h2 = generateMemoryKeyHash("u1", "mem_123");
    expect(h1).toBe(h2);
    expect(h1.startsWith("hash_")).toBe(true);
  });
});
