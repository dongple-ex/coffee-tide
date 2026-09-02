import { describe, it, expect } from "vitest";
import {
  evaluateMemoryRecall,
  selectTopRecalledMemories,
} from "./memoryRetrieval";
import { CompanionMemory } from "./contracts";

describe("Companion Memory Retrieval Engine (Phase 17-C)", () => {
  const baseMemory: CompanionMemory = {
    id: "mem_1",
    userId: "u1",
    personaScope: "shared",
    memoryType: "work_style",
    contentText: "오전 10시에는 기획 업무 집중을 선호함",
    status: "active",
    confidence: 0.8,
    userConfirmed: true,
    sensitivity: "normal",
    sourceRefs: [],
    recallCount: 0,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it("관련 검색어 및 활성 상태의 기억에 대해 적절한 회상 점수가 계산된다", () => {
    const result = evaluateMemoryRecall({
      memory: baseMemory,
      query: "오전 기획 업무 집중 어떻게 할까?",
      currentMode: "focus",
    });

    expect(result.isEligible).toBe(true);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it("7일 내 3회 이상 능동 회상된 기억은 반복 제한으로 제외된다", () => {
    const repeatedMemory: CompanionMemory = {
      ...baseMemory,
      lastRecalledAt: Date.now() - 1000 * 60 * 60, // 1시간 전
      recallCount: 3,
    };

    const result = evaluateMemoryRecall({
      memory: repeatedMemory,
      query: "오전 기획",
      currentMode: "momentum",
    });

    expect(result.isEligible).toBe(false);
    expect(result.rejectReason).toBe("repetition_limit_exceeded");
  });

  it("restricted 민감도의 기억은 회상에서 제외된다", () => {
    const restrictedMemory: CompanionMemory = {
      ...baseMemory,
      sensitivity: "restricted",
    };

    const result = evaluateMemoryRecall({
      memory: restrictedMemory,
      query: "오전 기획",
      currentMode: "momentum",
    });

    expect(result.isEligible).toBe(false);
    expect(result.rejectReason).toBe("restricted_sensitivity");
  });

  it("selectTopRecalledMemories가 상위 일치 기억을 선별한다", () => {
    const top = selectTopRecalledMemories([baseMemory], "오전 기획", "focus", 2);
    expect(top.length).toBe(1);
    expect(top[0].id).toBe("mem_1");
  });
});
