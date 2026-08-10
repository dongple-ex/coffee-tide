import { NextResponse } from "next/server";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import {
  migrateLegacyIntegrations,
  writeSessionForCurrentUser,
} from "@/lib/auth/integrationStore";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return unauthorized();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return unauthorized();

  const { error: profileError } = await supabase.from("user_profiles").upsert({
    id: user.id,
    email: user.email,
    updated_at: new Date().toISOString(),
  });
  if (profileError) {
    // 인증은 유지하되 스키마 미적용 상태를 서버 로그로 알린다.
    console.error("[POST /api/auth/bootstrap] Profile upsert failed", profileError.message);
  }

  const current = await readSession();
  const next = {
    ...current,
    userEmail: user.email,
    createdAt: current?.createdAt ?? new Date().toISOString(),
  };
  const migrationReady = current ? await migrateLegacyIntegrations(next) : true;
  return writeSessionForCurrentUser(
    NextResponse.json({ success: true, email: user.email }),
    next,
    !migrationReady
  );
}
