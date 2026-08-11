export function youtubeAiErrorStatus(message: string): number {
  if (/호출 한도|quota/i.test(message)) return 429;
  if (/응답 시간이 초과|timeout/i.test(message)) return 504;
  if (/API 키|GEMINI_API_KEY|권한/.test(message)) return 503;
  if (/비공개|접근할 수 없는/.test(message)) return 422;
  return 502;
}
