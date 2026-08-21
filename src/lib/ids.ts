/** crypto.randomUUID 우선, 미지원 환경에서는 접두사 붙은 난수 문자열로 폴백하는 공용 ID 생성기 */
export function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
