import {
  RELATIONSHIP_LEVEL_SPECS,
  calculateRawLevelFromExp,
} from "@/lib/companion/relationshipEngine";
import {
  createCompanionDomainEvent,
} from "@/lib/companion/eventLedger";
import {
  saveLocalCompanionEvent,
} from "@/lib/companion/repositories/indexedDb";

export interface AffectionLevelInfo {
  level: number;
  title: string;
  badge: string;
  minExp: number;
  maxExp: number;
  description: string;
  rewardPerk: {
    name: string;
    description: string;
    icon: string;
  };
  secretQuote?: string;
}

export const AFFECTION_LEVELS: AffectionLevelInfo[] = RELATIONSHIP_LEVEL_SPECS.map((spec) => ({
  level: spec.level,
  title: spec.title,
  badge: spec.badge,
  minExp: spec.minExp,
  maxExp: spec.maxExp,
  description: spec.description,
  rewardPerk: {
    name: spec.perkDescription,
    description: spec.description,
    icon: spec.level === 5 ? "👑" : spec.level === 4 ? "🎨" : spec.level === 3 ? "✨" : spec.level === 2 ? "💡" : "📋",
  },
  secretQuote: spec.secretQuote,
}));

export type AffectionAction =
  | "complete_task"   // 할 일 완료 (+15/12 EXP)
  | "view_briefing"   // 데일리 브리핑 확인 (+10/8 EXP)
  | "chat_message"    // 코파일럿 대화 (0 EXP)
  | "order_drink"     // 바리스타 음료 주문 (0 EXP)
  | "canvas_action"   // 캔버스 태스크 등록/편집 (+15/8 EXP)
  | "idle_laugh";     // 유휴 토크 확인 (0 EXP)

export const ACTION_EXP_MAP: Record<AffectionAction, { exp: number; label: string }> = {
  complete_task: { exp: 12, label: "업무 완료 달성! ✨" },
  canvas_action: { exp: 8, label: "캔버스 작업 완수! 🎨" },
  view_briefing: { exp: 8, label: "일일 브리핑 확인 ☀️" },
  chat_message: { exp: 0, label: "활발한 업무 소통 💬" },
  order_drink: { exp: 0, label: "시그니처 음료 주문 ☕" },
  idle_laugh: { exp: 0, label: "리프레시 공감 토크 😆" },
};

const STORAGE_KEY_PREFIX = "coffeetide_affection_";
const memoryStore = new Map<string, PersonaAffectionState>();

export interface PersonaAffectionState {
  presetId: string;
  exp: number;
  completedTasksCount: number;
  totalInteractions: number;
  lastUpdated: number;
}

/** 캐릭터별 호감도 상태 로드 (동기식 호환 API) */
export function getAffectionState(presetId = "karina"): PersonaAffectionState {
  if (typeof window === "undefined") {
    return memoryStore.get(presetId) || {
      presetId,
      exp: 0,
      completedTasksCount: 0,
      totalInteractions: 0,
      lastUpdated: Date.now(),
    };
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${presetId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.exp === "number") {
        return parsed;
      }
    }
  } catch {
    // ignore
  }

  return memoryStore.get(presetId) || {
    presetId,
    exp: 0,
    completedTasksCount: 0,
    totalInteractions: 0,
    lastUpdated: Date.now(),
  };
}

/** 캐릭터별 호감도 상태 저장 (동기식 호환 API) */
export function saveAffectionState(state: PersonaAffectionState): void {
  memoryStore.set(state.presetId, state);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${state.presetId}`, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/** 현재 EXP에 해당하는 레벨 정보 및 게이지 퍼센트 계산 */
export function calculateLevelInfo(exp: number): {
  levelInfo: AffectionLevelInfo;
  progressPercent: number;
  currentLevelExp: number;
  nextLevelNeededExp: number;
  isMaxLevel: boolean;
} {
  const calc = calculateRawLevelFromExp(exp);
  const matchedInfo = AFFECTION_LEVELS.find((l) => l.level === calc.levelSpec.level) || AFFECTION_LEVELS[0];

  return {
    levelInfo: matchedInfo,
    progressPercent: calc.progressPercent,
    currentLevelExp: calc.currentLevelExp,
    nextLevelNeededExp: calc.nextLevelNeededExp,
    isMaxLevel: calc.isMaxLevel,
  };
}

/** 호감도 경험치 추가 및 레벨업 여부 반환 (호환 함수) */
export function addAffectionExp(
  presetId: string,
  action: AffectionAction
): {
  prevExp: number;
  newExp: number;
  gainedExp: number;
  actionLabel: string;
  isLevelUp: boolean;
  newLevelInfo: AffectionLevelInfo;
} {
  const current = getAffectionState(presetId);
  const actionInfo = ACTION_EXP_MAP[action] || { exp: 0, label: "상호작용" };

  // 서버 도메인 이벤트 규약으로 이벤트 생성
  const event = createCompanionDomainEvent({
    userId: "guest",
    personaId: presetId,
    eventType:
      action === "complete_task"
        ? "task_completed"
        : action === "view_briefing"
        ? "daily_reflection_saved"
        : action === "canvas_action"
        ? "artifact_accepted"
        : "chat_message_sent",
    authority: "local_provisional",
    sourceItemId: `local_${Date.now()}`,
    payload: { isPlanned: true, isImportant: true },
  });

  const prevExp = current.exp;
  const newExp = prevExp + event.bondDelta;

  const prevLevel = calculateLevelInfo(prevExp).levelInfo.level;
  const newLevelCalc = calculateLevelInfo(newExp);
  const isLevelUp = newLevelCalc.levelInfo.level > prevLevel;

  const nextState: PersonaAffectionState = {
    ...current,
    exp: newExp,
    completedTasksCount: action === "complete_task" ? current.completedTasksCount + 1 : current.completedTasksCount,
    totalInteractions: current.totalInteractions + 1,
    lastUpdated: Date.now(),
  };

  saveAffectionState(nextState);

  // IndexedDB에 로컬 이벤트 비동기 저장
  if (event.bondDelta > 0) {
    void saveLocalCompanionEvent(event);
  }

  // 커스텀 이벤트 디스패치 (UI 실시간 갱신용)
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("coffeetide:affection-updated", {
        detail: {
          presetId,
          prevExp,
          newExp,
          gainedExp: event.bondDelta,
          actionLabel: actionInfo.label,
          isLevelUp,
          levelInfo: newLevelCalc.levelInfo,
        },
      })
    );
  }

  return {
    prevExp,
    newExp,
    gainedExp: event.bondDelta,
    actionLabel: actionInfo.label,
    isLevelUp,
    newLevelInfo: newLevelCalc.levelInfo,
  };
}
