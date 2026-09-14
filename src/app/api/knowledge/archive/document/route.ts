import { NextRequest, NextResponse } from "next/server";
import type { KnowledgeArchiveDocument } from "@/lib/knowledge/archive";
import { requireSupabaseUser } from "@/lib/supabase/server";
import { persistDriveSession, runGoogleDriveCall } from "@/lib/knowledge/archiveDrive";

type ArchiveDocumentRow = {
  id: string;
  source_kind: KnowledgeArchiveDocument["sourceKind"];
  source_id: string;
  title: string;
  doc_type: KnowledgeArchiveDocument["docType"];
  content_text: string;
  content_hash: string;
  source_created_at: string;
  source_updated_at: string;
  archived_at: string;
  version: number;
  chunk_count: number;
  content_provider: KnowledgeArchiveDocument["contentProvider"];
  drive_file_id?: string;
  drive_url?: string;
  privacy_scope: KnowledgeArchiveDocument["privacyScope"];
  ai_policy: KnowledgeArchiveDocument["aiPolicy"];
  keywords?: string[];
};

export async function POST(request: NextRequest) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const archiveId = typeof body.id === "string" ? body.id : "";
  const validArchiveId = archiveId.startsWith("archive:canvas:") || archiveId.startsWith("archive:item:");
  if (!validArchiveId || archiveId.length > 300) {
    return NextResponse.json({ error: "유효한 아카이브 ID가 필요합니다." }, { status: 400 });
  }

  const result = await auth.supabase
    .from("knowledge_archive_documents")
    .select("id,source_kind,source_id,title,doc_type,content_text,content_hash,source_created_at,source_updated_at,archived_at,version,chunk_count,content_provider,drive_file_id,drive_url,privacy_scope,ai_policy,keywords")
    .eq("user_id", auth.user.id)
    .eq("id", archiveId)
    .maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 503 });
  if (!result.data) return NextResponse.json({ error: "아카이브 문서를 찾지 못했습니다." }, { status: 404 });

  const row = result.data as ArchiveDocumentRow;
  let content = row.content_text;
  if (!content && row.content_provider === "google_drive" && row.drive_file_id) {
    const driveResult = await runGoogleDriveCall((drive) => drive.downloadTextFile(row.drive_file_id!));
    await persistDriveSession(driveResult);
    if (driveResult.status !== "ok") {
      const status = driveResult.status === "not_connected" || driveResult.status === "auth_expired" ? 409 : 502;
      return NextResponse.json({
        error: driveResult.status === "not_connected"
          ? "Google Drive 연결이 필요합니다."
          : "Google Drive 원문을 불러오지 못했습니다.",
      }, { status });
    }
    content = driveResult.value;
  }

  const document: KnowledgeArchiveDocument = {
    id: row.id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    title: row.title,
    docType: row.doc_type,
    content,
    contentHash: row.content_hash,
    createdAt: row.source_created_at,
    updatedAt: row.source_updated_at,
    archivedAt: row.archived_at,
    version: Number(row.version) || 1,
    chunkCount: Number(row.chunk_count) || 0,
    contentProvider: row.content_provider,
    driveFileId: row.drive_file_id,
    driveUrl: row.drive_url,
    privacyScope: row.privacy_scope,
    aiPolicy: row.ai_policy,
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
  };
  return NextResponse.json({ document });
}
