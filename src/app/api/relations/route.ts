import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";
import { mapItemRelationFromDb, mapItemRelationToDbRow } from "@/lib/data/mappers";
import { buildItemRelation, hasDuplicateRelation } from "@/lib/relations/service";

export async function GET(req: NextRequest) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId");

  let query = supabase
    .from("item_relations")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (itemId) {
    query = query.or(`from_item_id.eq.${itemId},to_item_id.eq.${itemId}`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const relations = (data || []).map(mapItemRelationFromDb);
  return NextResponse.json({ relations });
}

export async function POST(req: NextRequest) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  try {
    const body = await req.json();
    const relation = buildItemRelation(body, user.id);

    // 중복 관계 검사
    const { data: existingRows } = await supabase
      .from("item_relations")
      .select("*")
      .eq("user_id", user.id)
      .is("deleted_at", null);

    const existingRelations = (existingRows || []).map(mapItemRelationFromDb);
    if (hasDuplicateRelation(existingRelations, relation)) {
      return NextResponse.json({ error: "Duplicate relation already exists" }, { status: 409 });
    }

    const dbRow = mapItemRelationToDbRow(relation, user.id);
    const { data, error } = await supabase
      .from("item_relations")
      .insert(dbRow)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ relation: mapItemRelationFromDb(data) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Relation creation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
