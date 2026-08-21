/** unknown 에러를 사용자/로그용 메시지 문자열로 정규화한다. */
export function errorMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error) return error.message;
  return fallback ?? String(error ?? "");
}
