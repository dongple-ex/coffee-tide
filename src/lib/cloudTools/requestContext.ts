import "server-only";

import {
  persistRefreshedIntegration,
  readSessionWithIntegrations,
} from "@/lib/auth/integrationStore";
import { refreshChannel, REFRESH_WINDOW_MS } from "@/lib/auth/refresh";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CloudToolContext } from "./types";

export async function cloudToolRequestContext(
  timezone = "Asia/Seoul"
): Promise<Omit<CloudToolContext, "requestId" | "signal"> | null> {
  let session = await readSessionWithIntegrations();
  if (
    session?.googleRefreshToken &&
    session.googleTokenExpiry &&
    session.googleTokenExpiry - Date.now() < REFRESH_WINDOW_MS
  ) {
    const refreshed = await refreshChannel("google", session);
    if (refreshed) {
      session = refreshed;
      await persistRefreshedIntegration("google", refreshed);
    }
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const {
    data: { session: supabaseSession },
  } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  if (!session && !user) return null;

  const userId = user?.id ?? session?.userEmail ?? "";
  if (!userId) return null;
  return {
    userId,
    sessionBinding: session?.createdAt ?? supabaseSession?.access_token ?? `supabase:${userId}`,
    timezone,
    items: [],
    ...(session?.googleToken ? { googleAccessToken: session.googleToken } : {}),
    ...(session?.googleEmail ? { googleEmail: session.googleEmail } : {}),
  };
}
