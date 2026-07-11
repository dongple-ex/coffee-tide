import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { readSession, unauthorized, writeSession } from "@/lib/auth/cookies";
import { buildGoogleAuthUrl, isGoogleConfigured } from "@/lib/auth/google";

export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Google 연동이 서버에 설정되지 않았습니다 (.env의 GOOGLE_* 변수 확인)" },
      { status: 501 }
    );
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildGoogleAuthUrl(state));
  res.cookies.set("tp_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}

export async function DELETE() {
  const session = await readSession();
  if (!session) return unauthorized();
  const next = { ...session };
  delete next.googleToken;
  delete next.googleRefreshToken;
  delete next.googleTokenExpiry;
  delete next.googleEmail;
  return writeSession(NextResponse.json({ success: true }), next);
}
