// 인증 가드 — Next 16 규약(proxy.ts). doc/01-as-built-reference.md §2.
// 공개 경로 외 요청에 세션 쿠키를 요구. 만료 판독은 평문 보조 쿠키(SESSION_EXPIRY_COOKIE).

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { SESSION_COOKIE, SESSION_EXPIRY_COOKIE } from "@/lib/auth/cookieNames";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

const PUBLIC_PATHS = [
  "/",
  "/sw.js", // Service Worker (웹 푸시)
  "/icon.svg", // 파비콘 (세션 없는 첫 방문에서도 로드)
  "/manifest.webmanifest", // PWA 매니페스트 (설치 시 세션 없이 로드)
  "/icon-192.png", // 매니페스트·알림 아이콘
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/badge-72.png", // 알림 상태바 badge
  "/apple-icon.png", // iOS 홈 화면 아이콘 (Next 파일 규약)
  "/api/auth/signin",
  "/api/auth/outlook",
  "/api/auth/outlook/callback",
  "/api/auth/google/signin",
  "/api/auth/google/callback",
  "/auth/callback",
  "/api/briefing/daily", // 외부 크론 트리거 (CRON_SECRET으로 자체 인증)
  "/api/spark/ingest", // Gemini Spark 수신 Webhook
];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });
  let hasSupabaseUser = false;
  const config = getSupabasePublicConfig();
  if (config) {
    const supabase = createServerClient(config.url, config.publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headersToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as CookieOptions);
          });
          Object.entries(headersToSet).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    hasSupabaseUser = Boolean(user);
  }

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return response;
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const expiry = request.cookies.get(SESSION_EXPIRY_COOKIE)?.value;
  const expired = expiry ? Number(expiry) < Date.now() : false;

  if ((!session || expired) && !hasSupabaseUser) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
