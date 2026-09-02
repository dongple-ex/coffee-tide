// 🧠 CoffeeTide 프롬프트 컨텍스트 패키지 빌더 (Phase 17-B)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §9.1, §11.2

import {
  CompanionContextPackage,
  CompanionProfile,
  CompanionMemory,
  CompanionCurrentMode,
} from "./contracts";
import { RELATIONSHIP_LEVEL_SPECS } from "./relationshipEngine";

/**
 * AI 모델에 전달할 안전하고 제한된 CompanionContextPackage 빌더
 * - 민감한 정보나 삭제된 기억은 제외
 * - 확인된 기억(userConfirmed) 위주로 상위 3~5개만 선별
 * - 현재 관계 레벨에서 허용된 어조 특성(allowedToneTraits) 주입
 */
export function buildCompanionContextPackage(params: {
  personaId: string;
  profile?: Partial<CompanionProfile>;
  currentMode?: CompanionCurrentMode;
  sessionSummary?: string;
  memories?: CompanionMemory[];
  activeExperiment?: {
    axis: string;
    description: string;
  };
}): CompanionContextPackage {
  const level = params.profile?.relationshipLevel ?? 1;
  const spec =
    RELATIONSHIP_LEVEL_SPECS.find((s) => s.level === level) || RELATIONSHIP_LEVEL_SPECS[0];

  // 관계 레벨별 허용 어조 특성
  const allowedToneTraits: string[] = ["professional", "supportive"];
  if (level >= 2) allowedToneTraits.push("friendly", "custom_templates");
  if (level >= 3) allowedToneTraits.push("playful", "witty", "shared_humor");
  if (level >= 4) allowedToneTraits.push("intimate_partner", "tailored_nudge");
  if (level >= 5) allowedToneTraits.push("soulmate", "unconditional_trust");

  // 기억 패키징: active 상태이고 normal sensitivity인 기억만 최대 4개 선별
  const recalledMemories = (params.memories || [])
    .filter((m) => m.status === "active" && m.sensitivity === "normal")
    .slice(0, 4)
    .map((m) => ({
      id: m.id,
      type: m.memoryType,
      text: m.contentText,
      userConfirmed: m.userConfirmed,
    }));

  return {
    personaId: params.personaId,
    relationship: {
      level,
      title: spec.title,
      allowedToneTraits,
    },
    currentMode: params.currentMode || params.profile?.currentMode || "momentum",
    sessionSummary: params.sessionSummary,
    recalledMemories,
    activeGrowthExperiment: params.activeExperiment,
  };
}

/** 모델 시스템 프롬프트에 주입할 컴패니언 지침 문자열 생성 */
export function formatCompanionContextPrompt(pkg: CompanionContextPackage): string {
  const lines: string[] = [
    `[COMPANION CONTEXT & RELATIONSHIP STATE]`,
    `- 관계 단계: Lv.${pkg.relationship.level} ${pkg.relationship.title}`,
    `- 현재 작업 모드: ${pkg.currentMode}`,
    `- 허용된 상호작용 특성: ${pkg.relationship.allowedToneTraits.join(", ")}`,
  ];

  if (pkg.sessionSummary) {
    lines.push(`- 세션 요약: ${pkg.sessionSummary}`);
  }

  if (pkg.recalledMemories.length > 0) {
    lines.push(`- 참고할 사용자 선호 및 기억:`);
    pkg.recalledMemories.forEach((m) => {
      lines.push(`  * [${m.type}] ${m.text} (${m.userConfirmed ? "확인됨" : "추정"})`);
    });
  }

  if (pkg.activeGrowthExperiment) {
    lines.push(`- 진행 중인 성장 실험: [${pkg.activeGrowthExperiment.axis}] ${pkg.activeGrowthExperiment.description}`);
  }

  return lines.join("\n");
}
