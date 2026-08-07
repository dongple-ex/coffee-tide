import { NextResponse } from "next/server";
import { readSession, unauthorized, writeSession } from "@/lib/auth/cookies";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return unauthorized();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return unauthorized();

  const current = await readSession();
  return writeSession(NextResponse.json({ success: true, email: user.email }), {
    ...current,
    userEmail: user.email,
    createdAt: current?.createdAt ?? new Date().toISOString(),
  });
}
