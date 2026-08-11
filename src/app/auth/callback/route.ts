import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { writeSessionForCurrentUser } from "@/lib/auth/integrationStore";
import { getAuthSiteOrigin } from "@/lib/auth/siteOrigin";

function safeNextPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectOrigin = getAuthSiteOrigin(url.origin);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const supabase = await createServerSupabaseClient();

  if (!code || !supabase) {
    return NextResponse.redirect(new URL("/?authError=configuration", redirectOrigin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[Supabase Auth callback] Code exchange failed", error.message);
    return NextResponse.redirect(new URL("/?authError=exchange", redirectOrigin));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.redirect(new URL("/?authError=user", redirectOrigin));
  }

  const { error: profileError } = await supabase.from("user_profiles").upsert({
    id: user.id,
    email: user.email,
    updated_at: new Date().toISOString(),
  });
  if (profileError) {
    // Schema may not have been applied yet; authentication itself should still complete.
    console.error("[Supabase Auth callback] Profile upsert failed", profileError.message);
  }

  const response = NextResponse.redirect(new URL(next, redirectOrigin));

  // Existing Gmail/Outlook integrations still use the encrypted coffeeTide session.
  return writeSessionForCurrentUser(response, {
    userEmail: user.email,
    createdAt: new Date().toISOString(),
  });
}
