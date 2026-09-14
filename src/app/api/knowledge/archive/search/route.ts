import { NextRequest, NextResponse } from "next/server";
import { searchCloudArchive } from "@/lib/knowledge/archiveServer";
import { requireSupabaseUser } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as { query?: string; limit?: number };
    const query = typeof body.query === "string" ? body.query.slice(0, 300) : "";
    const limit = Math.max(1, Math.min(Number(body.limit) || 20, 50));
    const results = await searchCloudArchive(auth.supabase, query, limit);
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "아카이브 검색에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
