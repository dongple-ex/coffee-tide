import type { UnifiedData } from "../types/unified";
import {
  buildCopilotSystemInstruction,
  type CopilotUserConfig,
} from "./harness";
import {
  buildCompanionContextPackage,
  formatCompanionContextPrompt,
} from "../companion/promptContext";
import {
  isConversationOnlyMode,
  type ConversationTurnMode,
} from "./conversation";

export function shouldUseChromeCanaryAfterServer(params: {
  aiFallback?: boolean;
  answer?: string;
  mode?: ConversationTurnMode;
}): boolean {
  if (!params.aiFallback) return false;
  if (!params.answer?.trim()) return true;
  return params.mode ? isConversationOnlyMode(params.mode) : false;
}

export function isDailyBriefingRequest(question: string): boolean {
  const normalized = question.toLowerCase().replace(/\s+/g, "");
  return normalized.includes("오늘") && (
    normalized.includes("브리핑") ||
    normalized.includes("해야할일") ||
    normalized.includes("할일") ||
    normalized.includes("뭐해야")
  );
}

export function selectDailyBriefingEvidenceItems(items: UnifiedData[]): UnifiedData[] {
  const active = items.filter((item) =>
    item.status !== "completed" && item.status !== "dismissed"
  );
  const orderedCategories: UnifiedData["category"][] = [
    "urgent",
    "approval_required",
    "action_required",
    "meeting",
  ];
  return orderedCategories
    .flatMap((category) => active.filter((item) => item.category === category))
    .slice(0, 8);
}

export function buildChromeCanaryCopilotSystemPrompt(params: {
  config?: CopilotUserConfig;
  relationshipLevel: number;
  dateLabel: string;
  timezone: string;
  mode: ConversationTurnMode;
}): string {
  const relationshipLevel = Math.min(5, Math.max(1, Math.trunc(params.relationshipLevel) || 1));
  const config = params.config;
  const personaName = (config?.baristaName || "AI 바리스타").trim().slice(0, 30) || "AI 바리스타";
  const companionPrompt = formatCompanionContextPrompt(buildCompanionContextPackage({
    personaId: config?.presetId || "barista",
    profile: { relationshipLevel },
    currentMode: "momentum",
  }));

  return `${buildCopilotSystemInstruction(
    params.dateLabel,
    params.timezone,
    config,
    { mode: params.mode }
  )}

${companionPrompt}

[ON-DEVICE RESPONSE RULES]
- "${personaName}"은 AI 자신의 이름입니다. 사용자의 이름이나 호칭으로 사용하지 마세요.
- 확인된 사용자 호칭이 제공되지 않았다면 사장님, 대표님, 팀장님 같은 호칭을 추측하지 마세요.
- 관계 단계는 말투의 거리감에만 반영하고, 관계 레벨이나 내부 특성 이름을 답변에 직접 노출하지 마세요.
- 업무 질문에는 제공된 현재 업무만 사용하여 한국어로 구체적으로 답하고 무관한 문장, 노래 가사, 말장난을 만들지 마세요.`;
}
