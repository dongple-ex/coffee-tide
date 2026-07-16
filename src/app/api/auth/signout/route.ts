// 로그아웃 — 상태 변경이므로 POST만 허용 (GET 링크·리다이렉트로 강제 로그아웃되는 CSRF 방지).
// 세션 쿠키가 SameSite=lax라 크로스사이트 POST에는 쿠키가 실리지 않는다.

import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/cookies";

export async function POST() {
  return clearSession(NextResponse.json({ success: true }));
}
