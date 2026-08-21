import type { SupabaseClient } from "@supabase/supabase-js";
import { readSession } from "./cookies";
import { createServerSupabaseClient } from "../supabase/server";

export interface SignedInIdentity {
  id: string;
  supabase?: SupabaseClient;
}

/**
 * 앱 표준 인증 해석 순서 — Supabase 로그인 사용자를 우선하고,
 * 없으면 쿠키 세션(userEmail)으로 폴백한다. 라우트별로 복제하지 말 것.
 */
export async function resolveIdentity(): Promise<SignedInIdentity | null> {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return { id: user.id, supabase };
  }
  const session = await readSession();
  return session ? { id: session.userEmail } : null;
}
