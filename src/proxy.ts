// 인증 가드 — Next 16 규약(proxy.ts). doc/as-built-reference.md §2.
// 공개 경로 외 요청에 세션 쿠키를 요구. 만료 판독은 평문 보조 쿠키(tp_session_expiry).

import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/sw.js", // Service Worker (웹 푸시)
  "/icon.svg", // 파비콘 (세션 없는 첫 방문에서도 로드)
  "/api/auth/signin",
  "/api/auth/outlook",
  "/api/auth/outlook/callback",
  "/api/auth/google/signin",
  "/api/auth/google/callback",
  "/api/briefing/daily", // 외부 크론 트리거 (CRON_SECRET으로 자체 인증)
];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get("tp_session")?.value;
  const expiry = request.cookies.get("tp_session_expiry")?.value;
  const expired = expiry ? Number(expiry) < Date.now() : false;

  if (!session || expired) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
