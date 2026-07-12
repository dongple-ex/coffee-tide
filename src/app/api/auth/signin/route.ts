// 게스트 세션 발급 — MS 인증 없이 즉시 대시보드 진입 (phase3 Step 1)

import { NextRequest, NextResponse } from "next/server";
import { writeSession } from "@/lib/auth/cookies";

export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/", request.url));
  return writeSession(res, {
    userEmail: "guest@coffeetide.dongple.kr",
    createdAt: new Date().toISOString(),
  });
}
