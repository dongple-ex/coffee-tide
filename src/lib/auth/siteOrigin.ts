const DEFAULT_PRODUCTION_ORIGIN = "https://coffee-tide.dongple.kr";

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isLocalAuthOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    return (
      protocol === "http:" &&
      (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

/**
 * 인증은 운영 canonical domain 한 곳으로 모은다. localhost만 PKCE/개발 쿠키가
 * 같은 origin에서 왕복하도록 예외 허용한다.
 */
export function getAuthSiteOrigin(currentOrigin?: string): string {
  const normalizedCurrent = currentOrigin ? normalizeOrigin(currentOrigin) : null;
  if (normalizedCurrent && isLocalAuthOrigin(normalizedCurrent)) return normalizedCurrent;

  return (
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL || "") ||
    DEFAULT_PRODUCTION_ORIGIN
  );
}

export function getSupabaseAuthCallbackUrl(currentOrigin?: string): string {
  return `${getAuthSiteOrigin(currentOrigin)}/auth/callback`;
}

export function getGoogleIntegrationCallbackUrl(currentOrigin?: string): string {
  return `${getAuthSiteOrigin(currentOrigin)}/api/auth/google/callback`;
}

export function getOutlookIntegrationCallbackUrl(currentOrigin?: string): string {
  return `${getAuthSiteOrigin(currentOrigin)}/api/auth/outlook/callback`;
}
