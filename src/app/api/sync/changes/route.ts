import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";
import { mapUnifiedItemFromDb } from "@/lib/data/mappers";
import type { SyncChangesResponse } from "@/lib/sync/contracts";
import type { WorkspaceItem } from "@/lib/data/contracts";

export async function GET(req: NextRequest) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

  // 5단계: 복합 커서 (updated_at, id) 정렬
  let query = supabase
    .from("unified_items")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);

  if (cursor) {
    try {
      const decodedCursor = Buffer.from(cursor, "base64").toString("utf-8");
      const [cursorTime, cursorId] = decodedCursor.split("|");
      if (cursorTime && cursorId) {
        // 복합 커서 조건: updated_at > cursorTime OR (updated_at = cursorTime AND id > cursorId)
        query = query.or(`updated_at.gt.${cursorTime},and(updated_at.eq.${cursorTime},id.gt.${cursorId})`);
      } else if (cursorTime) {
        query = query.gt("updated_at", cursorTime);
      }
    } catch {
      // 잘못된 커서일 경우 처음부터 조회
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const changes: WorkspaceItem[] = [];
  const tombstones: Array<{ id: string; version: number; deletedAt: string }> = [];

  for (const row of pageRows) {
    if (row.deleted_at) {
      tombstones.push({
        id: String(row.id),
        version: Number(row.version) || 1,
        deletedAt: String(row.deleted_at),
      });
    } else {
      changes.push(mapUnifiedItemFromDb(row));
    }
  }

  let nextCursor = "";
  if (pageRows.length > 0) {
    const lastRow = pageRows[pageRows.length - 1];
    nextCursor = Buffer.from(`${lastRow.updated_at}|${lastRow.id}`).toString("base64");
  }

  const response: SyncChangesResponse = {
    changes,
    tombstones,
    nextCursor,
    hasMore,
  };

  return NextResponse.json(response);
}
