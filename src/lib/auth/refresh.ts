// 라우트 공용 토큰 리프레시 — 선제(만료 임박 60초) + 반응형(401 시 1회) 리프레시(백로그 A3).
// /api/mails, /api/upload 등 외부 API를 호출하는 라우트에서 공유한다.

import { refreshGoogleToken } from "@/lib/auth/google";
import { refreshAccessToken } from "@/lib/auth/msal";
import { SessionData } from "@/lib/auth/session";

export const REFRESH_WINDOW_MS = 60 * 1000;

export async function refreshChannel(
  channel: "outlook" | "google",
  session: SessionData
): Promise<SessionData | null> {
  try {
    if (channel === "outlook" && session.outlookRefreshToken) {
      const t = await refreshAccessToken(session.outlookRefreshToken);
      return {
        ...session,
        outlookToken: t.accessToken,
        outlookRefreshToken: t.refreshToken ?? session.outlookRefreshToken,
        outlookTokenExpiry: t.expiresAt,
      };
    }
    if (channel === "google" && session.googleRefreshToken) {
      const t = await refreshGoogleToken(session.googleRefreshToken);
      return {
        ...session,
        googleToken: t.accessToken,
        googleRefreshToken: t.refreshToken ?? session.googleRefreshToken,
        googleTokenExpiry: t.expiresAt,
      };
    }
  } catch (err) {
    console.warn(`[coffeeTide] ${channel} 토큰 리프레시 실패`, err);
  }
  return null;
}

/** 만료 임박(60초 이내) 시에만 갱신. 갱신이 없거나 실패하면 null. */
export async function refreshGoogleIfExpiring(
  session: SessionData
): Promise<SessionData | null> {
  if (
    session.googleRefreshToken &&
    session.googleTokenExpiry &&
    session.googleTokenExpiry - Date.now() < REFRESH_WINDOW_MS
  ) {
    return refreshChannel("google", session);
  }
  return null;
}
