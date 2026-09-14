import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";
import {
  chunkArchiveContent,
  stableContentHash,
  type KnowledgeArchiveDocument,
} from "@/lib/knowledge/archive";
import { persistDriveSession, runGoogleDriveCall } from "@/lib/knowledge/archiveDrive";
import { extractArchiveKeywords } from "@/lib/knowledge/vocabulary";

const MAX_ARCHIVE_CHARS = 2_000_000;
const CANVAS_DOC_TYPES = new Set(["doc", "report", "email", "meeting_note", "checklist", "code"]);

export async function POST(request: NextRequest) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      document?: KnowledgeArchiveDocument;
      saveToDrive?: boolean;
    };
    const document = body.document;
    if (
      !document ||
      document.sourceKind !== "canvas" ||
      document.id !== `archive:canvas:${document.sourceId}` ||
      document.id.length > 300 ||
      typeof document.title !== "string" ||
      document.title.length > 500 ||
      !CANVAS_DOC_TYPES.has(document.docType) ||
      typeof document.content !== "string" ||
      !document.content.trim()
    ) {
      return NextResponse.json({ error: "유효한 완료 문서가 필요합니다." }, { status: 400 });
    }
    if (document.content.length > MAX_ARCHIVE_CHARS) {
      return NextResponse.json({ error: "문서는 200만 자까지 보관할 수 있습니다." }, { status: 413 });
    }

    const normalizedDocument: KnowledgeArchiveDocument = {
      ...document,
      title: document.title.trim() || "제목 없는 문서",
      contentHash: stableContentHash(`${document.title}\n${document.content}`),
      contentProvider: "supabase",
      driveFileId: undefined,
      driveUrl: undefined,
      privacyScope: "cloud_private",
      aiPolicy: "cloud_allowed",
      keywords: extractArchiveKeywords(document.title, document.content),
    };
    const chunks = chunkArchiveContent(normalizedDocument.id, normalizedDocument.content);
    let driveStatus: "saved" | "not_requested" | "not_connected" | "auth_expired" | "failed" =
      body.saveToDrive ? "not_connected" : "not_requested";

    if (body.saveToDrive) {
      const driveResult = await runGoogleDriveCall((drive) =>
        drive.saveArchiveMarkdown({
          archiveId: normalizedDocument.id,
          title: normalizedDocument.title,
          body: normalizedDocument.content,
          contentHash: normalizedDocument.contentHash,
          archivedAt: normalizedDocument.archivedAt,
        })
      );
      if (driveResult.status === "ok") {
        driveStatus = "saved";
        normalizedDocument.contentProvider = "google_drive";
        normalizedDocument.driveFileId = driveResult.value.id;
        normalizedDocument.driveUrl = driveResult.value.webViewLink;
      } else {
        driveStatus = driveResult.status;
      }
      await persistDriveSession(driveResult);
    }

    const databaseDocument = normalizedDocument.contentProvider === "google_drive"
      ? { ...normalizedDocument, content: "" }
      : normalizedDocument;
    const result = await auth.supabase.rpc("upsert_knowledge_archive", {
      p_archive: databaseDocument,
      p_chunks: chunks,
    });
    if (result.error) {
      if (driveStatus === "saved") {
        return NextResponse.json({
          stored: true,
          cloudStored: false,
          document: normalizedDocument,
          drive: { status: driveStatus, url: normalizedDocument.driveUrl },
          warning: "검색 인덱스 동기화는 실패했지만 Drive 원문은 저장했습니다.",
        });
      }
      return NextResponse.json({ error: result.error.message }, { status: 503 });
    }
    return NextResponse.json({
      stored: true,
      cloudStored: true,
      archive: result.data,
      document: normalizedDocument,
      drive: { status: driveStatus, url: normalizedDocument.driveUrl },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "아카이브 저장에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
