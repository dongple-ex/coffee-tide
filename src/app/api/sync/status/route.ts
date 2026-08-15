import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SyncStatusSummary } from "@/lib/sync/contracts";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("deviceId") || "unknown";

  const { data: lastSyncRow } = await supabase
    .from("unified_items")
    .select("updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const summary: SyncStatusSummary = {
    userId: user.id,
    deviceId,
    pendingMutationCount: 0,
    unresolvedConflictCount: 0,
    lastSyncedAt: lastSyncRow?.updated_at || undefined,
  };

  return NextResponse.json(summary);
}
