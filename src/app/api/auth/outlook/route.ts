// Outlook OAuth 시작 + 연동 해제(DELETE) — doc/01-as-built-reference.md §2

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { unauthorized } from "@/lib/auth/cookies";
import {
  deleteIntegrationForCurrentUser,
  readSessionWithIntegrations,
  writeSessionForCurrentUser,
} from "@/lib/auth/integrationStore";
import { buildOutlookAuthUrl, isOutlookConfigured } from "@/lib/auth/msal";
import { OAUTH_STATE_COOKIE } from "@/lib/auth/session";
import {
  getAuthSiteOrigin,
  getOutlookIntegrationCallbackUrl,
} from "@/lib/auth/siteOrigin";

export async function GET(request: NextRequest) {
  const currentOrigin = request.nextUrl.origin;
  const authOrigin = getAuthSiteOrigin(currentOrigin);
  if (currentOrigin !== authOrigin) {
    return NextResponse.redirect(new URL("/api/auth/outlook", authOrigin));
  }
  if (!isOutlookConfigured()) {
    return NextResponse.json(
      { error: "Outlook 연동이 서버에 설정되지 않았습니다 (.env의 MS_* 변수 확인)" },
      { status: 501 }
    );
  }
  const state = randomBytes(16).toString("hex");
  const redirectUri = getOutlookIntegrationCallbackUrl(currentOrigin);
  const res = NextResponse.redirect(buildOutlookAuthUrl(state, redirectUri));
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
  await deleteIntegrationForCurrentUser("outlook");
  const next = { ...session };
  delete next.outlookToken;
  delete next.outlookRefreshToken;
  delete next.outlookTokenExpiry;
  delete next.outlookEmail;
  return writeSessionForCurrentUser(NextResponse.json({ success: true }), next);
}
