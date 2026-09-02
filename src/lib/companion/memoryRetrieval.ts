// 🔍 CoffeeTide 기억 회상 점수 & 반복 제한 엔진 (Phase 17-C)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §7.4

import { CompanionMemory, CompanionCurrentMode } from "./contracts";

export interface MemoryRecallEvaluation {
  memory: CompanionMemory;
  score: number;
  isEligible: boolean;
  rejectReason?: string;
}

/**
 * 기억 회상 점수 계산 및 7일 반복 제한 검사
 */
export function evaluateMemoryRecall(params: {
  memory: CompanionMemory;
  query: string;
  currentMode: CompanionCurrentMode;
  now?: number;
}): MemoryRecallEvaluation {
  const { memory, query, currentMode } = params;
  const now = params.now ?? Date.now();

  // 1. 상태 및 민감도 가드
  if (memory.status !== "active") {
    return { memory, score: 0, isEligible: false, rejectReason: "not_active" };
  }
  if (memory.sensitivity === "restricted") {
    return { memory, score: 0, isEligible: false, rejectReason: "restricted_sensitivity" };
  }

  // 2. 반복 제한 검사 (7일 내 3회 이상 능동 회상 금지)
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  if (memory.lastRecalledAt && now - memory.lastRecalledAt < SEVEN_DAYS && memory.recallCount >= 3) {
    return { memory, score: 0, isEligible: false, rejectReason: "repetition_limit_exceeded" };
  }

  // 3. 키워드 기반 유사도 (0.0 ~ 1.0)
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  const memoryWords = memory.contentText.toLowerCase().split(/\s+/);
  const matchCount = queryWords.filter((qw) => memoryWords.some((mw) => mw.includes(qw))).length;
  const semanticRelevance = queryWords.length > 0 ? Math.min(1.0, matchCount / queryWords.length) : 0.3;

  // 4. 최신성 (recency, 0.0 ~ 1.0)
  const ageDays = Math.max(0, (now - memory.createdAt) / (24 * 60 * 60 * 1000));
  const recency = Math.max(0, 1.0 - ageDays / 60);

  // 5. 사용자 확인 가중치
  const userConfirmedScore = memory.userConfirmed ? 1.0 : 0.4;

  // 6. 모드 적합성
  let modeFit = 0.5;
  if (currentMode === "focus" && memory.memoryType === "work_style") modeFit = 1.0;
  if (currentMode === "reflection" && memory.memoryType === "commitment") modeFit = 1.0;

  // 회상 점수 공식 적용
  const score =
    0.35 * semanticRelevance +
    0.20 * recency +
    0.20 * userConfirmedScore +
    0.15 * 0.5 + // 기본 도움됨 기대치
    0.10 * modeFit;

  return {
    memory,
    score: Math.max(0, Math.min(1.0, score)),
    isEligible: score >= 0.35,
  };
}

/** 상위 관련 기억 N개 선별 */
export function selectTopRecalledMemories(
  memories: CompanionMemory[],
  query: string,
  currentMode: CompanionCurrentMode,
  limit = 3
): CompanionMemory[] {
  const evaluated = memories
    .map((m) => evaluateMemoryRecall({ memory: m, query, currentMode }))
    .filter((e) => e.isEligible)
    .sort((a, b) => b.score - a.score);

  return evaluated.slice(0, limit).map((e) => e.memory);
}
