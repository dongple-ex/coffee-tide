// 📜 CoffeeTide AI 컴패니언 성장·기억·관계 시스템 도메인 계약 (Phase 17)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md

export type CompanionGrowthMode = "off" | "shadow" | "pilot" | "on";

export interface CompanionFeatureAccess {
  serverMode: CompanionGrowthMode;
  killSwitchActive: boolean;
  cohortEligible: boolean;
  userEnabled: boolean;
}

export interface CompanionFeatureStatus {
  available: boolean;
  active: boolean;
  mode: CompanionGrowthMode;
  reason?: "kill_switch" | "not_in_cohort" | "user_disabled" | "server_off" | "shadow_mode";
  canToggle: boolean;
}

export type CompanionAuthority =
  | "server_domain"      // 실제 업무 변경을 처리한 서버 도메인/RPC
  | "server_receipt"     // 서버가 시작·완료를 모두 확인한 상호작용
  | "local_provisional"  // 게스트 또는 오프라인 클라이언트 (로컬 임시)
  | "legacy_import"      // 로그인 시 사용자가 승인한 기존 로컬 관계 스냅샷 (성장 집계 제외)
  | "diagnostic";        // 동의한 shadow 코호트의 규칙 평가 진단 로그

export type CompanionEventType =
  | "task_planned"
  | "task_progressed"
  | "task_completed"
  | "task_replanned"
  | "focus_session_completed"
  | "briefing_plan_accepted"
  | "artifact_accepted"
  | "daily_reflection_saved"
  | "growth_experiment_reviewed"
  | "memory_confirmed"
  | "rest_chosen"
  | "chat_message_sent"
  | "idle_talk_opened"
  | "legacy_relationship_imported";

export interface CompanionEventPayload {
  itemId?: string;
  sourceVersion?: number;
  isPlanned?: boolean;
  isImportant?: boolean;
  isSample?: boolean;
  isMock?: boolean;
  durationMinutes?: number;
  experimentId?: string;
  memoryId?: string;
  [key: string]: unknown;
}

export interface CompanionEvent {
  id: string;
  userId: string;
  personaId: string;
  eventType: CompanionEventType;
  authority: CompanionAuthority;
  sourceItemId?: string;
  sourceVersion?: number;
  sourceReceiptId?: string;
  idempotencyKey: string;
  payload: CompanionEventPayload;
  bondDelta: number;
  policyVersion: string;
  creditedDay: string; // YYYY-MM-DD
  creditedTimezone: string;
  occurredAt: number;
  createdAt: number;
}

export type CompanionCurrentMode =
  | "momentum"
  | "focus"
  | "stuck"
  | "overloaded"
  | "reflection"
  | "returning";

export interface CompanionProfile {
  userId: string;
  personaId: string;
  bondExp: number;
  relationshipLevel: number;
  currentMode: CompanionCurrentMode;
  modeExpiresAt?: number;
  preferredAddress?: string;
  lastInteractionAt: number;
  completedTasksCount: number;
  historyDeletedAt?: number;
  version: number;
  updatedAt: number;
}

export type CompanionMemoryType = "preference" | "work_style" | "commitment" | "boundary";
export type CompanionMemoryStatus = "candidate" | "active" | "rejected" | "expired" | "deleted";
export type CompanionSensitivity = "normal" | "restricted";

export interface CompanionMemory {
  id: string;
  userId: string;
  personaScope: "shared" | string; // 'shared' 또는 특정 personaId
  memoryType: CompanionMemoryType;
  contentText: string;
  contentJson?: Record<string, unknown>;
  status: CompanionMemoryStatus;
  confidence: number;
  userConfirmed: boolean;
  sensitivity: CompanionSensitivity;
  sourceRefs: string[];
  expiresAt?: number;
  lastRecalledAt?: number;
  recallCount: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface CompanionEpisode {
  id: string;
  userId: string;
  personaId: string;
  periodStart: number;
  periodEnd: number;
  summary: string;
  eventRefs: string[];
  itemRefs: string[];
  provider?: string;
  model?: string;
  promptVersion?: string;
  status: "current" | "stale" | "accepted" | "rejected";
  createdAt: number;
}

export interface GrowthMetrics {
  executionScore: number;
  focusScore: number;
  organizationScore: number;
  reflectionScore: number;
  sampleCount: number;
  isSampleSufficient: boolean;
  periodLabel: string;
}

export interface GrowthSnapshot {
  id: string;
  userId: string;
  periodStart: number;
  periodEnd: number;
  metrics: GrowthMetrics;
  insights: string[];
  experiment?: {
    id: string;
    axis: "execution" | "focus" | "organization" | "reflection";
    title: string;
    description: string;
    status: "proposed" | "accepted" | "rejected" | "completed";
  };
  evidenceEventIds: string[];
  acceptedAt?: number;
  reviewedAt?: number;
  createdAt: number;
}

export interface CompanionTransition {
  id: string;
  userId: string;
  personaId: string;
  fromLevel: number;
  toLevel: number;
  triggerEventIds: string[];
  sceneKey: string;
  shownAt?: number;
  replayedAt?: number;
  createdAt: number;
}

export interface CompanionDeletionTombstone {
  userId: string;
  resourceType: "memory" | "profile" | "growth" | "all";
  resourceKeyHash: string;
  deletionVersion: number;
  deletedAt: number;
  expiresAt: number; // 30일
}

// 🎯 Discriminated Union for Suggestions (Phase 17-B)
export type CompanionSuggestionAction =
  | { action: "send_prompt"; payload: { prompt: string; previewText?: string } }
  | { action: "start_timer"; payload: { durationMinutes: number; taskTitle?: string } }
  | { action: "open_item"; payload: { itemId: string } }
  | { action: "open_review"; payload: { reviewType: "daily" | "weekly"; periodDate?: string } };

export interface CompanionSuggestionItem {
  id: string;
  label: string;
  icon?: string;
  category: "productivity" | "roleplay" | "refresh" | "analysis";
  action: CompanionSuggestionAction["action"];
  payload: CompanionSuggestionAction["payload"];
}

export interface CompanionResponse {
  narration?: string; // 짧은 행동 지문, 최대 120자
  message: string;    // 실제 도움, 결론 우선
  suggestions: CompanionSuggestionItem[];
  evidenceRefs: string[]; // 업무·문서 근거 ID
  memoryRefs: string[];   // 사용한 개인 기억 ID
  growthNudge?: {
    axis: "execution" | "focus" | "organization" | "reflection";
    text: string;
  };
  candidateMemories?: Array<{
    type: CompanionMemoryType;
    text: string;
    confidence: number;
    requiresConfirmation: boolean;
  }>;
}

export interface CompanionContextPackage {
  personaId: string;
  relationship: {
    level: number;
    title: string;
    allowedToneTraits: string[];
  };
  currentMode: CompanionCurrentMode;
  sessionSummary?: string;
  recalledMemories: Array<{
    id: string;
    type: CompanionMemoryType;
    text: string;
    userConfirmed: boolean;
  }>;
  activeGrowthExperiment?: {
    axis: string;
    description: string;
  };
}
