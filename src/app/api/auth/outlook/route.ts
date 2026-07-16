// Outlook OAuth 시작 + 연동 해제(DELETE) — doc/as-built-reference.md §2

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { readSession, unauthorized, writeSession } from "@/lib/auth/cookies";
import { buildOutlookAuthUrl, isOutlookConfigured } from "@/lib/auth/msal";
import { OAUTH_STATE_COOKIE } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  if (!isOutlookConfigured()) {
    return NextResponse.json(
      { error: "Outlook 연동이 서버에 설정되지 않았습니다 (.env의 MS_* 변수 확인)" },
      { status: 501 }
    );
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildOutlookAuthUrl(state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  void request;
  return res;
}

export async function DELETE() {
  const session = await readSession();
  if (!session) return unauthorized();
  const next = { ...session };
  delete next.outlookToken;
  delete next.outlookRefreshToken;
  delete next.outlookTokenExpiry;
  delete next.outlookEmail;
  return writeSession(NextResponse.json({ success: true }), next);
}
