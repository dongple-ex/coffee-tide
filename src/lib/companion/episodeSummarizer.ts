// 📝 CoffeeTide 세션 요약 및 구조화 응답 검증기 (Phase 17-B)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §9.2, §11.1

import {
  CompanionResponse,
  CompanionSuggestionItem,
  CompanionSuggestionAction,
} from "./contracts";

/**
 * 모델이 반환한 JSON/텍스트를 CompanionResponse 규격으로 안전하게 검증 및 파싱
 * - 잘못된 JSON 형식이거나 필드가 누락되어도 결코 에러를 던지지 않고 안전한 Fallback 응답으로 복구
 * - 내부 추론(Chain of Thought)은 저장/노출하지 않고 정제
 * - suggestions.payload를 discriminated union 규격으로 안전하게 정규화
 */
export function parseCompanionResponse(
  rawText: string,
  fallbackMessage?: string
): CompanionResponse {
  const fallback: CompanionResponse = {
    message: fallbackMessage || rawText.replace(/[*_#]/g, "").slice(0, 300) || "답변을 준비했습니다.",
    suggestions: [],
    evidenceRefs: [],
    memoryRefs: [],
  };

  if (!rawText || typeof rawText !== "string") {
    return fallback;
  }

  // 1. JSON 블록 추출 시도
  let jsonStr = rawText.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (parsed && typeof parsed === "object") {
      const message =
        typeof parsed.message === "string" && parsed.message.trim()
          ? parsed.message.trim()
          : typeof parsed.content === "string" && parsed.content.trim()
          ? parsed.content.trim()
          : fallback.message;

      const narration =
        typeof parsed.narration === "string" && parsed.narration.trim()
          ? parsed.narration.trim().slice(0, 120)
          : undefined;

      // suggestions 정규화 (discriminated union)
      const suggestions: CompanionSuggestionItem[] = Array.isArray(parsed.suggestions)
        ? parsed.suggestions
            .filter((s: unknown) => s && typeof s === "object")
            .map((s: Record<string, unknown>, idx: number) => {
              const rawAction = String(s.action || "send_prompt");
              const label = String(s.label || s.title || `선택지 ${idx + 1}`).slice(0, 40);
              const icon = s.icon ? String(s.icon) : undefined;
              const category = (s.category || "productivity") as CompanionSuggestionItem["category"];
              const rawPayload = (s.payload || {}) as Record<string, unknown>;

              let action: CompanionSuggestionAction["action"] = "send_prompt";
              let payload: CompanionSuggestionAction["payload"] = {
                prompt: String(rawPayload.prompt || label),
              };

              if (rawAction === "start_timer") {
                action = "start_timer";
                payload = {
                  durationMinutes: Number(rawPayload.durationMinutes || 25),
                  taskTitle: rawPayload.taskTitle ? String(rawPayload.taskTitle) : undefined,
                };
              } else if (rawAction === "open_item") {
                action = "open_item";
                payload = {
                  itemId: String(rawPayload.itemId || ""),
                };
              } else if (rawAction === "open_review") {
                action = "open_review";
                payload = {
                  reviewType: rawPayload.reviewType === "weekly" ? "weekly" : "daily",
                  periodDate: rawPayload.periodDate ? String(rawPayload.periodDate) : undefined,
                };
              }

              return {
                id: String(s.id || `sug_${idx + 1}`),
                label,
                icon,
                category,
                action,
                payload,
              };
            })
        : [];

      const evidenceRefs = Array.isArray(parsed.evidenceRefs)
        ? parsed.evidenceRefs.map(String)
        : [];

      const memoryRefs = Array.isArray(parsed.memoryRefs)
        ? parsed.memoryRefs.map(String)
        : [];

      return {
        narration,
        message,
        suggestions,
        evidenceRefs,
        memoryRefs,
        growthNudge: parsed.growthNudge,
        candidateMemories: Array.isArray(parsed.candidateMemories)
          ? parsed.candidateMemories
          : undefined,
      };
    }
  } catch {
    // JSON 파싱 실패 시 일반 텍스트에서 *지문* 추출 시도
  }

  // 2. 일반 마크다운/텍스트에서 *지문*과 대사 분리 파싱
  const narrationMatch = rawText.match(/^\*([^*]+)\*\s*([\s\S]*)$/);
  if (narrationMatch) {
    return {
      narration: `*${narrationMatch[1].trim().slice(0, 120)}*`,
      message: narrationMatch[2].trim() || fallback.message,
      suggestions: [],
      evidenceRefs: [],
      memoryRefs: [],
    };
  }

  return {
    message: rawText.trim(),
    suggestions: [],
    evidenceRefs: [],
    memoryRefs: [],
  };
}

/** Gemini 에러나 타임아웃 시 사용할 안전한 Fallback 응답 */
export function createSafeFallbackCompanionResponse(
  personaName = "AI 바리스타",
  reason = "일시적인 연결 지연"
): CompanionResponse {
  return {
    narration: `*${personaName}가 따뜻한 머그잔을 건네며*`,
    message: `잠시 ${reason}이 발생했지만 기본 업무는 정상적으로 확인하실 수 있어요. 오늘 남은 중요 업무부터 천천히 확인해 볼까요?`,
    suggestions: [
      {
        id: "retry_summary",
        label: "오늘 할 일 다시 요약해줘",
        icon: "📋",
        category: "productivity",
        action: "send_prompt",
        payload: { prompt: "오늘 해야 할 핵심 업무 3가지만 간결하게 정리해줘." },
      },
    ],
    evidenceRefs: [],
    memoryRefs: [],
  };
}
