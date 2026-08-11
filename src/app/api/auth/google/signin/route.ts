import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { unauthorized } from "@/lib/auth/cookies";
import {
  deleteIntegrationForCurrentUser,
  readSessionWithIntegrations,
  writeSessionForCurrentUser,
} from "@/lib/auth/integrationStore";
import { buildGoogleAuthUrl, isGoogleConfigured, revokeGoogleToken } from "@/lib/auth/google";
import { OAUTH_STATE_COOKIE } from "@/lib/auth/session";
import {
  getAuthSiteOrigin,
  getGoogleIntegrationCallbackUrl,
} from "@/lib/auth/siteOrigin";

export async function GET(request: NextRequest) {
  const currentOrigin = request.nextUrl.origin;
  const authOrigin = getAuthSiteOrigin(currentOrigin);
  if (currentOrigin !== authOrigin) {
    return NextResponse.redirect(new URL("/api/auth/google/signin", authOrigin));
  }
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Google 연동이 서버에 설정되지 않았습니다 (.env의 GOOGLE_* 변수 확인)" },
      { status: 501 }
    );
  }
  const state = randomBytes(16).toString("hex");
  const redirectUri = getGoogleIntegrationCallbackUrl(currentOrigin);
  const res = NextResponse.redirect(buildGoogleAuthUrl(state, redirectUri));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}

export async function DELETE() {
  const session = await readSessionWithIntegrations();
  if (!session) return unauthorized();
  const revokeToken = session.googleRefreshToken || session.googleToken;
  if (revokeToken) await revokeGoogleToken(revokeToken);
  await deleteIntegrationForCurrentUser("google");
  const next = { ...session };
  delete next.googleToken;
  delete next.googleRefreshToken;
  delete next.googleTokenExpiry;
  delete next.googleEmail;
  return writeSessionForCurrentUser(NextResponse.json({ success: true }), next);
}
