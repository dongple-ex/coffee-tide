// 📒 CoffeeTide 이벤트 원장 & 신뢰 경계 엔진 (Phase 17-A 심층 구현)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §8

import {
  CompanionEvent,
  CompanionEventType,
  CompanionAuthority,
  CompanionEventPayload,
} from "./contracts";

export const COMPANION_POLICY_VERSION = "2026-09-01";
export const DAILY_MAX_TOTAL_BOND_EXP = 60;

export interface EventExpRule {
  defaultExp: number;
  dailyLimit: number;
  description: string;
}

/** 10대 이벤트별 EXP 가중치 및 일일 상한 정의 (§8.4) */
export const EVENT_EXP_POLICY: Record<CompanionEventType, EventExpRule> = {
  task_completed: {
    defaultExp: 6,
    dailyLimit: 24, // 계획+중요 업무 시 12 EXP / 상한 36
    description: "업무 완료 (계획된 중요 업무 최초 완료 시 +12)",
  },
  task_planned: {
    defaultExp: 4,
    dailyLimit: 8,
    description: "오늘 할 일 계획 수립",
  },
  task_progressed: {
    defaultExp: 4,
    dailyLimit: 12,
    description: "의미 있는 업무 진행 메모 / 하위 작업 완료",
  },
  task_replanned: {
    defaultExp: 2,
    dailyLimit: 6,
    description: "일정 지연에 따른 안전한 재계획",
  },
  focus_session_completed: {
    defaultExp: 6,
    dailyLimit: 18,
    description: "집중 타이머 세션 완수",
  },
  briefing_plan_accepted: {
    defaultExp: 4,
    dailyLimit: 8,
    description: "일일 브리핑 제안 수락",
  },
  artifact_accepted: {
    defaultExp: 8,
    dailyLimit: 16,
    description: "AI 산출물(초안/캔버스/정리) 채택 후 업무 반영",
  },
  daily_reflection_saved: {
    defaultExp: 8,
    dailyLimit: 8,
    description: "일일 마감 회고 저장",
  },
  growth_experiment_reviewed: {
    defaultExp: 20,
    dailyLimit: 20,
    description: "주간 성장 실험 검토 및 채택",
  },
  memory_confirmed: {
    defaultExp: 4,
    dailyLimit: 8,
    description: "기억 후보 확인 또는 직접 수정",
  },
  rest_chosen: {
    defaultExp: 0,
    dailyLimit: 0,
    description: "과부하 상태에서 휴식 선택 (EXP 무차감, 자책 방지)",
  },
  chat_message_sent: {
    defaultExp: 0,
    dailyLimit: 0,
    description: "일반 채팅 (EXP 보상 없음, 스팸 방지)",
  },
  idle_talk_opened: {
    defaultExp: 0,
    dailyLimit: 0,
    description: "유휴 토크 확인 (EXP 보상 없음)",
  },
  legacy_relationship_imported: {
    defaultExp: 0,
    dailyLimit: 0,
    description: "Phase 16 로컬 관계 스냅샷 이전 (성장 보상 제외)",
  },
};

/** 멱등 키 생성 규칙 (§8.2.3) */
export function buildCompanionIdempotencyKey(params: {
  eventType: CompanionEventType;
  itemId?: string;
  sourceVersion?: number;
  artifactId?: string;
  creditedDay?: string;
  periodStart?: string;
  sessionReceiptId?: string;
  memoryId?: string;
  memoryVersion?: number;
  personaId?: string;
}): string {
  const { eventType } = params;

  switch (eventType) {
    case "task_completed":
      return `v1:task_completed:item:${params.itemId || "unknown"}`;
    case "task_progressed":
      return `v1:task_progressed:item:${params.itemId || "unknown"}:version:${params.sourceVersion ?? 1}`;
    case "task_replanned":
      return `v1:task_replanned:item:${params.itemId || "unknown"}:version:${params.sourceVersion ?? 1}`;
    case "artifact_accepted":
      return `v1:artifact_accepted:artifact:${params.artifactId || params.itemId || "unknown"}`;
    case "daily_reflection_saved":
      return `v1:daily_reflection:day:${params.creditedDay || new Date().toISOString().slice(0, 10)}`;
    case "growth_experiment_reviewed":
      return `v1:growth_review:period:${params.periodStart || "current"}`;
    case "focus_session_completed":
      return `v1:focus_session:receipt:${params.sessionReceiptId || params.itemId || "unknown"}`;
    case "memory_confirmed":
      return `v1:memory_confirmed:memory:${params.memoryId || "unknown"}:version:${params.memoryVersion ?? 1}`;
    case "legacy_relationship_imported":
      return `v1:legacy_import:persona:${params.personaId || "karina"}`;
    default:
      return `v1:${eventType}:item:${params.itemId || "unknown"}:day:${params.creditedDay || new Date().toISOString().slice(0, 10)}`;
  }
}

/** 타임존 기준 credited_day 계산 (서버 기준 계산) */
export function calculateCreditedDay(timestamp: number, timezone = "Asia/Seoul"): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date(timestamp)); // YYYY-MM-DD
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

/**
 * 서버 권위 이벤트 생성 & EXP 가중치/상한 판정 순수 함수 (§8.4, §8.5)
 * - 브라우저가 보낸 임의의 bondDelta/중요도 조작 무시
 * - Mock/샘플 데이터는 무조건 0 EXP
 * - 일일 상한 및 일일 총합(60 EXP) 상한 적용
 */
export function createCompanionDomainEvent(params: {
  userId: string;
  personaId: string;
  eventType: CompanionEventType;
  authority: CompanionAuthority;
  sourceItemId?: string;
  sourceVersion?: number;
  sourceReceiptId?: string;
  payload?: CompanionEventPayload;
  timezone?: string;
  occurredAt?: number;
  existingDayEvents?: CompanionEvent[]; // 해당 일자(creditedDay)의 기존 이벤트 목록
}): CompanionEvent {
  const occurredAt = params.occurredAt ?? Date.now();
  const timezone = params.timezone || "Asia/Seoul";
  const creditedDay = calculateCreditedDay(occurredAt, timezone);
  const payload = params.payload || {};

  const idempotencyKey = buildCompanionIdempotencyKey({
    eventType: params.eventType,
    itemId: params.sourceItemId,
    sourceVersion: params.sourceVersion,
    artifactId: payload.artifactId as string | undefined,
    creditedDay,
    sessionReceiptId: params.sourceReceiptId,
    memoryId: payload.memoryId as string | undefined,
    personaId: params.personaId,
  });

  // 1. Mock/샘플 데이터 체크 (§8.4)
  const isSampleOrMock = Boolean(payload.isSample || payload.isMock);
  if (isSampleOrMock) {
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `evt_${Date.now()}_${Math.random()}`,
      userId: params.userId,
      personaId: params.personaId,
      eventType: params.eventType,
      authority: params.authority,
      sourceItemId: params.sourceItemId,
      sourceVersion: params.sourceVersion,
      sourceReceiptId: params.sourceReceiptId,
      idempotencyKey,
      payload: { ...payload, bondIgnoredReason: "mock_or_sample_data" },
      bondDelta: 0,
      policyVersion: COMPANION_POLICY_VERSION,
      creditedDay,
      creditedTimezone: timezone,
      occurredAt,
      createdAt: Date.now(),
    };
  }

  // 2. 기본 EXP 결정 (서버 정책 기준)
  let rawExp = EVENT_EXP_POLICY[params.eventType]?.defaultExp ?? 0;

  // 세부 가중치 규칙: 계획된 중요 업무 완료 시 +12
  if (params.eventType === "task_completed") {
    if (payload.isPlanned && payload.isImportant) {
      rawExp = 12;
    } else if (payload.isPlanned || payload.isImportant) {
      rawExp = 8;
    } else {
      rawExp = 6;
    }
  }

  // 3. 일일 상한 및 일일 총합(60 EXP) 상한 검사
  const dayEvents = params.existingDayEvents || [];
  const currentTypeDayExp = dayEvents
    .filter((e) => e.eventType === params.eventType && e.creditedDay === creditedDay)
    .reduce((sum, e) => sum + e.bondDelta, 0);

  const currentTotalDayExp = dayEvents
    .filter((e) => e.creditedDay === creditedDay)
    .reduce((sum, e) => sum + e.bondDelta, 0);

  const typeLimit =
    params.eventType === "task_completed" && payload.isPlanned && payload.isImportant
      ? 36
      : EVENT_EXP_POLICY[params.eventType]?.dailyLimit ?? 24;

  const allowedByType = Math.max(0, typeLimit - currentTypeDayExp);
  const allowedByTotal = Math.max(0, DAILY_MAX_TOTAL_BOND_EXP - currentTotalDayExp);
  const finalBondDelta = Math.min(rawExp, allowedByType, allowedByTotal);

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `evt_${Date.now()}_${Math.random()}`,
    userId: params.userId,
    personaId: params.personaId,
    eventType: params.eventType,
    authority: params.authority,
    sourceItemId: params.sourceItemId,
    sourceVersion: params.sourceVersion,
    sourceReceiptId: params.sourceReceiptId,
    idempotencyKey,
    payload,
    bondDelta: finalBondDelta,
    policyVersion: COMPANION_POLICY_VERSION,
    creditedDay,
    creditedTimezone: timezone,
    occurredAt,
    createdAt: Date.now(),
  };
}
