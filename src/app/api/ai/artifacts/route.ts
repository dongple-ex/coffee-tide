import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";
import { mapAiArtifactFromDb, mapAiArtifactToDbRow } from "@/lib/data/mappers";
import { buildAiArtifact } from "@/lib/ai/artifacts";

export async function GET(req: NextRequest) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId");

  let query = supabase
    .from("ai_artifacts")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (itemId) {
    query = query.eq("item_id", itemId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const artifacts = (data || []).map(mapAiArtifactFromDb);
  return NextResponse.json({ artifacts });
}

export async function POST(req: NextRequest) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  try {
    const body = await req.json();
    const artifact = buildAiArtifact(body, user.id);
    const dbRow = mapAiArtifactToDbRow(artifact, user.id);

    const { data, error } = await supabase
      .from("ai_artifacts")
      .insert(dbRow)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ artifact: mapAiArtifactFromDb(data) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "AI Artifact creation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
