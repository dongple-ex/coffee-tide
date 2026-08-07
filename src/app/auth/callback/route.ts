import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { writeSession } from "@/lib/auth/cookies";

function safeNextPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const supabase = await createServerSupabaseClient();

  if (!code || !supabase) {
    return NextResponse.redirect(new URL("/?authError=configuration", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[Supabase Auth callback] Code exchange failed", error.message);
    return NextResponse.redirect(new URL("/?authError=exchange", url.origin));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.redirect(new URL("/?authError=user", url.origin));
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

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const redirectOrigin =
    process.env.NODE_ENV === "development" || !forwardedHost
      ? url.origin
      : `${forwardedProto}://${forwardedHost}`;
  const response = NextResponse.redirect(`${redirectOrigin}${next}`);

  // Existing Gmail/Outlook integrations still use the encrypted coffeeTide session.
  return writeSession(response, {
    userEmail: user.email,
    createdAt: new Date().toISOString(),
  });
}
