import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/auth/cookies";
import {
  deleteIntegrationForCurrentUser,
  readSessionWithIntegrations,
  writeSessionForCurrentUser,
} from "@/lib/auth/integrationStore";
import { buildGoogleAuthUrl, isGoogleConfigured, revokeGoogleToken } from "@/lib/auth/google";
import { OAUTH_STATE_COOKIE } from "@/lib/auth/session";

export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Google 연동이 서버에 설정되지 않았습니다 (.env의 GOOGLE_* 변수 확인)" },
      { status: 501 }
    );
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildGoogleAuthUrl(state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
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
