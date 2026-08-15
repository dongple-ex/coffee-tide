import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapItemRelationFromDb, mapUnifiedItemFromDb } from "@/lib/data/mappers";
import { searchKnowledge } from "@/lib/knowledge/search";
import type { KnowledgeSearchRequest } from "@/lib/knowledge/contracts";

export async function POST(req: NextRequest) {
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

  try {
    const body: KnowledgeSearchRequest = await req.json();
    if (!body.query || typeof body.query !== "string") {
      return NextResponse.json({ error: "Query string is required" }, { status: 400 });
    }

    // 1. 사용자 항목 및 관계 조회
    const [itemsResult, relationsResult] = await Promise.all([
      supabase.from("unified_items").select("*").eq("user_id", user.id).is("deleted_at", null),
      supabase.from("item_relations").select("*").eq("user_id", user.id).is("deleted_at", null),
    ]);

    if (itemsResult.error) {
      return NextResponse.json({ error: itemsResult.error.message }, { status: 500 });
    }

    const items = (itemsResult.data || []).map(mapUnifiedItemFromDb);
    const relations = (relationsResult.data || []).map(mapItemRelationFromDb);

    const result = searchKnowledge(items, relations, body);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
