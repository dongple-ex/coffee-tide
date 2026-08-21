import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabasePublicConfig, getSupabaseSecretKey } from "./config";

export async function createServerSupabaseClient(): Promise<SupabaseClient | null> {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies. proxy.ts refreshes them.
        }
      },
    },
  });
}

export type SupabaseUserContext =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; response: NextResponse };

/**
 * 라우트 핸들러용 인증 전처리 — 클라이언트 생성(503)과 로그인 확인(401)을 한 곳에서
 * 처리해 응답 형태를 통일한다. 사용:
 *   const auth = await requireSupabaseUser();
 *   if (!auth.ok) return auth.response;
 *   const { supabase, user } = auth;
 */
export async function requireSupabaseUser(
  unauthorizedMessage = "Unauthorized"
): Promise<SupabaseUserContext> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Supabase service unavailable" }, { status: 503 }),
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: unauthorizedMessage }, { status: 401 }),
    };
  }

  return { ok: true, supabase, user };
}

export function createAdminSupabaseClient(): SupabaseClient | null {
  const config = getSupabasePublicConfig();
  const secretKey = getSupabaseSecretKey();
  if (!config || !secretKey) return null;

  return createClient(config.url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
