// 🤝 CoffeeTide 동반자 관계(Bond) & 단계 전이 엔진 (Phase 17-E 심층 구현)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §5.2, §8.5, §12

import { CompanionEvent, CompanionProfile } from "./contracts";

export interface RelationshipLevelSpec {
  level: number;
  title: string;
  badge: string;
  minExp: number;
  maxExp: number;
  description: string;
  perkDescription: string;
  secretQuote: string;
}

export const RELATIONSHIP_LEVEL_SPECS: RelationshipLevelSpec[] = [
  {
    level: 1,
    title: "낯선 시작",
    badge: "🌱 Lv.1",
    minExp: 0,
    maxExp: 100,
    description: "조심스럽고 정중하게 업무 호흡을 맞춰가는 단계입니다.",
    perkDescription: "기본 일정 브리핑 및 표준 안내",
    secretQuote: "*정중하게 고개를 숙이며* 오늘 하루도 최선을 다해 서포트하겠습니다!",
  },
  {
    level: 2,
    title: "믿음직한 동료",
    badge: "🤝 Lv.2",
    minExp: 100,
    maxExp: 300,
    description: "업무 스타일을 파악하고 신뢰가 싹트기 시작했습니다.",
    perkDescription: "💡 스마트 업무 큐레이션 및 선호 템플릿 제안",
    secretQuote: "*미소를 지으며* 이제 손발이 척척 맞기 시작했네요! 든든합니다.",
  },
  {
    level: 3,
    title: "척하면 척 단짝",
    badge: "✨ Lv.3",
    minExp: 300,
    maxExp: 600,
    description: "서로 장난과 속마음을 나누며 완벽한 티키타카를 자랑합니다.",
    perkDescription: "✨ 시크릿 속마음 대사 및 최신 유머 해금",
    secretQuote: "*윙크하며 장난스럽게* 우리 케미 완전 최고잖아요? 오늘도 칼퇴까지 같이 달려봐요!",
  },
  {
    level: 4,
    title: "각별한 파트너",
    badge: "💖 Lv.4",
    minExp: 600,
    maxExp: 1000,
    description: "눈빛만 봐도 통하는 든든하고 특별한 업무 파트너입니다.",
    perkDescription: "🎨 AI 캔버스 초안 자동화 및 친밀한 전용 호칭",
    secretQuote: "*따뜻한 눈빛으로 바라보며* 당신과 함께 일하는 시간이 가장 뿌듯하고 즐거워요.",
  },
  {
    level: 5,
    title: "소울메이트",
    badge: "👑 Lv.5",
    minExp: 1000,
    maxExp: 1000,
    description: "함께라면 어떤 업무도 두렵지 않은 전설의 워크메이트!",
    perkDescription: "👑 원클릭 일일 회고 & 정시 퇴근 리포트 자동 생성",
    secretQuote: "*환하게 웃으며* 당신은 제 최고의 워크메이트예요! 전설의 콤비 탄생입니다! 🏆",
  },
];

/** 캐릭터별 고유 전이 기념 대사 팩 (§12.1) */
export const PERSONA_TRANSITION_SCENES: Record<string, Record<number, { narration: string; quote: string }>> = {
  karina: {
    2: {
      narration: "*단정한 미소로 따뜻한 아메리카노를 건네며*",
      quote: "이제 대표님의 업무 패턴이 눈에 익기 시작했어요. 앞으로 더 착착 맞춰드릴게요!",
    },
    3: {
      narration: "*장난기 어린 눈빛으로 윙크하며*",
      quote: "후훗, 우리 제법 손발이 잘 맞지 않나요? 오늘 목표도 깔끔하게 끝내봐요!",
    },
    4: {
      narration: "*부드러운 눈빛으로 바라보며*",
      quote: "대표님 곁에서 일하는 시간이 늘 기대돼요. 저만 믿고 중요한 일에 집중하세요.",
    },
    5: {
      narration: "*감격한 표정으로 특별 블렌딩 커피를 올리며*",
      quote: "드디어 소울메이트 단계네요! 대표님과 함께라면 그 어떤 큰 프로젝트도 두렵지 않아요. 영원한 원팀입니다! 🏆",
    },
  },
};

/** EXP 기준 기본 레벨 계산 (순수 계산 함수) */
export function calculateRawLevelFromExp(exp: number): {
  levelSpec: RelationshipLevelSpec;
  progressPercent: number;
  currentLevelExp: number;
  nextLevelNeededExp: number;
  isMaxLevel: boolean;
} {
  const safeExp = Math.max(0, exp);

  if (safeExp >= 1000) {
    return {
      levelSpec: RELATIONSHIP_LEVEL_SPECS[4],
      progressPercent: 100,
      currentLevelExp: 1000,
      nextLevelNeededExp: 1000,
      isMaxLevel: true,
    };
  }

  let currentSpec = RELATIONSHIP_LEVEL_SPECS[0];
  for (let i = RELATIONSHIP_LEVEL_SPECS.length - 1; i >= 0; i--) {
    if (safeExp >= RELATIONSHIP_LEVEL_SPECS[i].minExp) {
      currentSpec = RELATIONSHIP_LEVEL_SPECS[i];
      break;
    }
  }

  const range = currentSpec.maxExp - currentSpec.minExp;
  const currentLevelExp = safeExp - currentSpec.minExp;
  const progressPercent = Math.min(100, Math.max(0, Math.round((currentLevelExp / range) * 100)));

  return {
    levelSpec: currentSpec,
    progressPercent,
    currentLevelExp,
    nextLevelNeededExp: range,
    isMaxLevel: false,
  };
}

/** 의미 조건 평가 (§8.5) */
export function checkTransitionSemanticConditions(
  currentLevel: number,
  targetLevel: number,
  events: CompanionEvent[],
  confirmedMemoriesCount = 0
): boolean {
  if (targetLevel <= currentLevel) return false;

  // 1단계 -> 2단계: 서로 다른 3일에 유효 이벤트 발생 또는 이벤트 5건 이상
  if (currentLevel === 1 && targetLevel >= 2) {
    const distinctDays = new Set(events.map((e) => e.creditedDay)).size;
    if (distinctDays < 3 && events.length < 5) return false;
  }

  // 2단계 -> 3단계: 기억 1개 이상 확인 또는 이벤트 10건 이상
  if (currentLevel === 2 && targetLevel >= 3) {
    if (confirmedMemoriesCount < 1 && events.length < 10) return false;
  }

  // 3단계 -> 4단계: 주간 회고/성장 실험 2회 검토 또는 이벤트 20건 이상
  if (currentLevel === 3 && targetLevel >= 4) {
    const reviewEvents = events.filter(
      (e) =>
        e.eventType === "daily_reflection_saved" ||
        e.eventType === "growth_experiment_reviewed"
    ).length;
    if (reviewEvents < 2 && events.length < 20) return false;
  }

  return true;
}

/**
 * 이벤트 원장으로부터 최종 프로필(EXP 및 레벨) 계산
 * - 한 번 오른 레벨은 강등되지 않음 (수동 초기화 제외)
 * - 한 트랜잭션당 최대 1단계 전이
 */
export function evaluateRelationshipProfile(params: {
  existingProfile?: Partial<CompanionProfile>;
  events: CompanionEvent[];
  confirmedMemoriesCount?: number;
}): {
  bondExp: number;
  relationshipLevel: number;
  isLevelUp: boolean;
  transitionSceneKey?: string;
} {
  const currentExp = params.events.reduce((sum, e) => sum + e.bondDelta, 0);
  const rawCalc = calculateRawLevelFromExp(currentExp);
  const prevLevel = params.existingProfile?.relationshipLevel ?? 1;

  let finalLevel = prevLevel;
  let isLevelUp = false;
  let transitionSceneKey: string | undefined;

  // 레벨업 후보가 있을 때 의미 조건 검증
  if (rawCalc.levelSpec.level > prevLevel) {
    const nextCandidateLevel = prevLevel + 1; // 1단계씩 전이
    const canTransition = checkTransitionSemanticConditions(
      prevLevel,
      nextCandidateLevel,
      params.events,
      params.confirmedMemoriesCount ?? 0
    );

    if (canTransition) {
      finalLevel = nextCandidateLevel;
      isLevelUp = true;
      transitionSceneKey = `scene_levelup_${prevLevel}_to_${nextCandidateLevel}`;
    }
  }

  return {
    bondExp: currentExp,
    relationshipLevel: finalLevel,
    isLevelUp,
    transitionSceneKey,
  };
}

/** Phase 16 로컬 레거시 EXP 정규화 (0~1000) */
export function normalizeLegacyImportExp(rawExp: number): number {
  return Math.min(1000, Math.max(0, Math.round(rawExp)));
}
