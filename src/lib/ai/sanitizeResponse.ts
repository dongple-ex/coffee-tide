// AI 생성 응답의 토큰 디코딩 붕괴(반복 루프, 가타카나 글리치, 무한 온점 등) 감지 및 정제 유틸리티

const DEFAULT_CLEAN_FALLBACK =
  "안녕하세요! 친근한 AI 바리스타입니다. 커피 한 잔과 함께 어떤 업무를 도와드릴까요? ☕";

/**
 * 텍스트 내의 온점 무한 반복(`. . . . . .`)을 깔끔한 말줄임표(`...`)로 압축합니다.
 */
export function compressRepeatedDots(text: string): string {
  return text.replace(/(?:\.\s*){4,}\.?/g, "... ");
}

/**
 * 자연스러운 감정 표현(ㅋ, ㅎ, ㅠ, ㅜ, ~, !, ?)을 제외하고,
 * 비정상적으로 동일 문자가 4회 이상 연속 반복되는 토큰 루프 패턴이 있는지 감지합니다.
 */
export function hasDegeneratedCharLoop(text: string): boolean {
  // 예: "エバババババババ", "우우우우우우우"
  return /([^\s\dㅋㅎㅠㅜ~!?.,·])\1{4,}/.test(text);
}

/**
 * 한국어 서비스 문맥에서 비정상적인 일본어 가타카나 연속열(5자 이상)이 혼입되었는지 감지합니다.
 */
export function hasKatakanaGlitch(text: string): boolean {
  return /[ァ-ンヴー]{4,}/.test(text);
}

/**
 * 텍스트가 심각하게 붕괴(Degeneration/Glitch)되었는지 판별합니다.
 */
export function isSeverelyDegenerated(text: string): boolean {
  if (!text) return true;
  if (hasKatakanaGlitch(text)) return true;
  if (hasDegeneratedCharLoop(text)) return true;

  // 온점/특수기호의 비율이 전체 텍스트의 40% 이상인 경우
  const dotCount = (text.match(/\./g) || []).length;
  if (dotCount >= 10 && dotCount / text.length > 0.3) {
    return true;
  }

  return false;
}

/**
 * AI 응답 텍스트를 정제하고, 심각한 글리치가 발생한 경우 안전한 기본 멘트로 대체합니다.
 */
export function sanitizeAiResponse(
  rawText: string,
  fallbackMessage: string = DEFAULT_CLEAN_FALLBACK
): string {
  if (!rawText || !rawText.trim()) return fallbackMessage;

  // 1. 온점 및 공백 반복 축약
  const cleaned = compressRepeatedDots(rawText.trim());

  // 2. 가타카나 혼입이나 문자 반복 루프 등 심각한 글리치가 있으면 안전한 멘트로 즉시 대체
  if (isSeverelyDegenerated(cleaned)) {
    return fallbackMessage;
  }

  return cleaned;
}
