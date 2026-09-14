import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";
import { mapItemRelationFromDb, mapUnifiedItemFromDb } from "@/lib/data/mappers";
import { searchKnowledge } from "@/lib/knowledge/search";
import type { KnowledgeSearchRequest } from "@/lib/knowledge/contracts";
import { searchCloudArchive } from "@/lib/knowledge/archiveServer";

export async function POST(req: NextRequest) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  try {
    const body: KnowledgeSearchRequest = await req.json();
    const [itemsResult, relationsResult] = await Promise.all([
      supabase.from("unified_items").select("*").eq("user_id", user.id).is("deleted_at", null),
      supabase.from("item_relations").select("*").eq("user_id", user.id).is("deleted_at", null),
    ]);

    const items = (itemsResult.data || []).map(mapUnifiedItemFromDb);
    const relations = (relationsResult.data || []).map(mapItemRelationFromDb);

    const contextPackage = searchKnowledge(items, relations, body);
    if (body.executionPolicy === "cloud_allowed" && body.query?.trim()) {
      const archiveResults = await searchCloudArchive(supabase, body.query, body.limit || 5).catch(() => []);
      const limit = Math.max(1, Math.min(body.limit || 5, 50));
      contextPackage.evidence = [
        ...contextPackage.evidence,
        ...archiveResults.map((archive) => ({
          itemId: archive.document.id,
          chunkId: `${archive.document.id}:best`,
          title: archive.document.title,
          excerpt: archive.excerpt,
          sourceVersion: archive.document.version,
          updatedAt: archive.document.archivedAt,
          score: Math.max(archive.score, 0.2),
          scoreReason: "keyword" as const,
        })),
      ]
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
    }
    return NextResponse.json({ contextPackage });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Context build failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
