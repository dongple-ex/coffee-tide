// 게스트 세션 발급 — MS 인증 없이 즉시 대시보드 진입 (phase3 Step 1).
// 랜딩의 <a> 링크(최상위 내비게이션)라 GET 유지 — 대신 크로스사이트 발동을 차단해
// 외부 사이트가 기존 세션(연동 토큰 포함)을 게스트 세션으로 덮어쓰는 CSRF를 막는다.

import { NextRequest, NextResponse } from "next/server";
import { writeSession } from "@/lib/auth/cookies";

export async function GET(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    // 세션을 건드리지 않고 랜딩으로 — 사용자가 원하면 직접 '시작하기'를 누른다
    return NextResponse.redirect(new URL("/", request.url));
  }
  const res = NextResponse.redirect(new URL("/", request.url));
  return writeSession(res, {
    userEmail: "guest@coffeetide.dongple.kr",
    createdAt: new Date().toISOString(),
  });
}
