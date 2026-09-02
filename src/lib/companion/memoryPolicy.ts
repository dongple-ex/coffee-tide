// 🧠 CoffeeTide 장기 기억 후보 분류·민감도·보존 정책 엔진 (Phase 17-C 심층 구현)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §7, §13.7

import {
  CompanionMemory,
  CompanionMemoryType,
  CompanionSensitivity,
} from "./contracts";

// 민감 정보 키워드 (자동 장기 저장 절대 금지)
const SENSITIVE_KEYWORDS = [
  "건강", "병원", "질병", "우울", "약물", "가족", "부모", "자녀", "이혼",
  "재정", "대출", "빚", "연봉", "계좌", "비밀번호", "갈등", "사생활",
];

// 추론 성격 키워드 (장기 사실로 확정 금지)
const PERSONALITY_INFERENCE_KEYWORDS = [
  "완벽주의", "게으른", "불안한", "성격", "외향적", "내향적", "MBTI", "집착",
];

export interface CandidateEvaluationResult {
  isEligible: boolean;
  type?: CompanionMemoryType;
  sensitivity: CompanionSensitivity;
  requiresConfirmation: boolean;
  rejectReason?: string;
  confidence: number;
}

/**
 * 텍스트로부터 기억 후보 적합성, 타입 및 민감도 정밀 검사 (§7.2, §7.3)
 */
export function evaluateMemoryCandidate(text: string): CandidateEvaluationResult {
  const normalized = text.trim();
  if (normalized.length < 3) {
    return {
      isEligible: false,
      sensitivity: "normal",
      requiresConfirmation: true,
      rejectReason: "too_short",
      confidence: 0,
    };
  }

  // 1. 민감 정보 검사 (자동 저장 금지)
  const hasSensitive = SENSITIVE_KEYWORDS.some((kw) => normalized.includes(kw));
  if (hasSensitive) {
    return {
      isEligible: false,
      sensitivity: "restricted",
      requiresConfirmation: true,
      rejectReason: "sensitive_information_blocked",
      confidence: 0,
    };
  }

  // 2. 추론 성격 검사 (장기 사실로 저장 금지)
  const hasPersonalityInference = PERSONALITY_INFERENCE_KEYWORDS.some((kw) => normalized.includes(kw));
  if (hasPersonalityInference) {
    return {
      isEligible: false,
      sensitivity: "normal",
      requiresConfirmation: true,
      rejectReason: "personality_inference_blocked",
      confidence: 0.2,
    };
  }

  // 3. 호칭 / 캐릭터 어조 설정 (즉시 저장 가능)
  if (
    normalized.includes("불러줘") ||
    normalized.includes("호칭") ||
    normalized.includes("말투") ||
    normalized.includes("님이라고")
  ) {
    return {
      isEligible: true,
      type: "preference",
      sensitivity: "normal",
      requiresConfirmation: false,
      confidence: 0.9,
    };
  }

  // 4. 표현 선호 (요약 스타일, 글자수)
  if (
    normalized.includes("요약") ||
    normalized.includes("스타일") ||
    normalized.includes("길이") ||
    normalized.includes("줄로") ||
    normalized.includes("개조식")
  ) {
    return {
      isEligible: true,
      type: "preference",
      sensitivity: "normal",
      requiresConfirmation: false,
      confidence: 0.85,
    };
  }

  // 5. 작업 방식 (시간대, 회의, 집중 패턴) -> 사용자 확인 필수
  if (
    normalized.includes("오전") ||
    normalized.includes("오후") ||
    normalized.includes("요일") ||
    normalized.includes("마다") ||
    normalized.includes("집중") ||
    normalized.includes("타이머")
  ) {
    return {
      isEligible: true,
      type: "work_style",
      sensitivity: "normal",
      requiresConfirmation: true,
      confidence: 0.75,
    };
  }

  // 6. 중요한 약속 / 마일스톤 -> 사용자 확인 필수
  if (
    normalized.includes("마감") ||
    normalized.includes("출시") ||
    normalized.includes("데드라인") ||
    normalized.includes("발표") ||
    normalized.includes("약속")
  ) {
    return {
      isEligible: true,
      type: "commitment",
      sensitivity: "normal",
      requiresConfirmation: true,
      confidence: 0.8,
    };
  }

  // 7. 경계 (금지 사항, 언급 회피)
  if (
    normalized.includes("언급하지 마") ||
    normalized.includes("묻지 마") ||
    normalized.includes("금지")
  ) {
    return {
      isEligible: true,
      type: "boundary",
      sensitivity: "normal",
      requiresConfirmation: true,
      confidence: 0.95,
    };
  }

  return {
    isEligible: true,
    type: "preference",
    sensitivity: "normal",
    requiresConfirmation: true,
    confidence: 0.5,
  };
}

/**
 * 기억 보존 기간 만료 여부 판정 (§13.7)
 * - 미확인 기억 후보: 14일 만료
 * - 확인된 의미 기억: 180일 후 재확인 권장
 * - tombstone: 30일 보존
 */
export function checkMemoryRetentionStatus(memory: CompanionMemory, now = Date.now()): {
  isExpired: boolean;
  needsReconfirmation: boolean;
} {
  const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
  const ONE_HUNDRED_EIGHTY_DAYS = 180 * 24 * 60 * 60 * 1000;

  if (memory.status === "candidate" && now - memory.createdAt > FOURTEEN_DAYS) {
    return { isExpired: true, needsReconfirmation: false };
  }

  if (memory.status === "active" && memory.userConfirmed && now - memory.createdAt > ONE_HUNDRED_EIGHTY_DAYS) {
    return { isExpired: false, needsReconfirmation: true };
  }

  return { isExpired: false, needsReconfirmation: false };
}

/** 게스트 로컬 tombstone용 결정론적 식별자 (서버 삭제는 node:crypto SHA-256 사용, §13.6) */
export function generateMemoryKeyHash(userId: string, memoryIdOrContent: string): string {
  let hash = 0;
  const str = `${userId}:${memoryIdOrContent}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16)}`;
}
