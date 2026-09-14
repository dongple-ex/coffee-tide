import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  KnowledgeArchiveDocument,
  KnowledgeArchiveSearchResult,
} from "./archive";
import { expandSearchTerms } from "./vocabulary";

type ArchiveSearchRow = {
  archive_id: string;
  source_kind: KnowledgeArchiveDocument["sourceKind"];
  source_id: string;
  title: string;
  doc_type: KnowledgeArchiveDocument["docType"];
  content_hash: string;
  source_created_at: string;
  source_updated_at: string;
  archived_at: string;
  version: number;
  chunk_count: number;
  content_provider?: KnowledgeArchiveDocument["contentProvider"];
  drive_file_id?: string;
  drive_url?: string;
  privacy_scope?: KnowledgeArchiveDocument["privacyScope"];
  ai_policy?: KnowledgeArchiveDocument["aiPolicy"];
  keywords?: string[];
  excerpt: string;
  score: number;
};

export async function searchCloudArchive(
  supabase: SupabaseClient,
  query: string,
  limit = 20
): Promise<KnowledgeArchiveSearchResult[]> {
  const result = await supabase.rpc("search_knowledge_archive", {
    p_query: query,
    p_terms: expandSearchTerms(query),
    p_limit: Math.max(1, Math.min(limit, 50)),
  });
  if (result.error) throw new Error(result.error.message);

  return ((result.data ?? []) as ArchiveSearchRow[]).map((row) => ({
    document: {
      id: row.archive_id,
      sourceKind: row.source_kind,
      sourceId: row.source_id,
      title: row.title,
      docType: row.doc_type,
      content: "",
      contentHash: row.content_hash,
      createdAt: row.source_created_at,
      updatedAt: row.source_updated_at,
      archivedAt: row.archived_at,
      version: Number(row.version) || 1,
      chunkCount: Number(row.chunk_count) || 0,
      contentProvider: row.content_provider ?? "supabase",
      driveFileId: row.drive_file_id,
      driveUrl: row.drive_url,
      privacyScope: row.privacy_scope ?? "cloud_private",
      aiPolicy: row.ai_policy ?? "cloud_allowed",
      keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    },
    excerpt: row.excerpt || "",
    score: Number(row.score) || 0,
    storage: "cloud",
  }));
}
