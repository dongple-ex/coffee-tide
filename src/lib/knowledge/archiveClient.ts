"use client";

import type { CanvasDocument } from "@/lib/canvas/types";
import {
  chunkArchiveContent,
  createCanvasArchive,
  searchArchiveIndex,
  type KnowledgeArchiveDocument,
  type KnowledgeArchiveSearchResult,
} from "./archive";
import {
  getArchiveDocument,
  loadArchiveFromIndexedDb,
  saveArchiveToIndexedDb,
} from "./archiveDb";

export interface ArchiveSaveResult {
  archive: KnowledgeArchiveDocument;
  locations: { local: true; cloud: boolean; drive: boolean };
  driveStatus?: "saved" | "not_requested" | "not_connected" | "auth_expired" | "failed";
}

export interface ArchiveSearchResponse {
  results: KnowledgeArchiveSearchResult[];
  cloudAvailable: boolean;
}

export async function archiveCanvasDocument(
  document: CanvasDocument,
  options: { saveToDrive?: boolean; ownerScope: string }
): Promise<ArchiveSaveResult> {
  const previous = await getArchiveDocument(options.ownerScope, `archive:canvas:${document.id}`);
  const archive = createCanvasArchive(document, previous?.version ?? 0);
  if (previous?.contentHash === archive.document.contentHash) {
    archive.document.version = previous.version;
  }
  await saveArchiveToIndexedDb(options.ownerScope, archive.document, archive.chunks);

  try {
    const response = await fetch("/api/knowledge/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: archive.document, saveToDrive: options.saveToDrive === true }),
    });
    if (response.ok) {
      const payload = (await response.json()) as {
        document?: KnowledgeArchiveDocument;
        cloudStored?: boolean;
        drive?: { status?: ArchiveSaveResult["driveStatus"] };
      };
      const savedDocument = payload.document?.id === archive.document.id
        ? { ...payload.document, content: archive.document.content }
        : archive.document;
      await saveArchiveToIndexedDb(options.ownerScope, savedDocument, archive.chunks);
      return {
        archive: savedDocument,
        locations: {
          local: true,
          cloud: payload.cloudStored === true,
          drive: payload.drive?.status === "saved",
        },
        driveStatus: payload.drive?.status,
      };
    }
  } catch {
    // 오프라인 또는 비로그인 상태에서는 로컬 정본으로 계속 동작합니다.
  }
  return {
    archive: archive.document,
    locations: { local: true, cloud: false, drive: false },
  };
}

function compareArchiveFreshness(
  left: KnowledgeArchiveDocument,
  right: KnowledgeArchiveDocument
): number {
  if (left.version !== right.version) return left.version - right.version;
  const leftUpdatedAt = Date.parse(left.updatedAt);
  const rightUpdatedAt = Date.parse(right.updatedAt);
  if (Number.isFinite(leftUpdatedAt) && Number.isFinite(rightUpdatedAt) && leftUpdatedAt !== rightUpdatedAt) {
    return leftUpdatedAt - rightUpdatedAt;
  }
  return 0;
}

export function mergeArchiveSearchResults(
  localResults: KnowledgeArchiveSearchResult[],
  cloudResults: KnowledgeArchiveSearchResult[],
  limit: number
): KnowledgeArchiveSearchResult[] {
  const merged = new Map<string, KnowledgeArchiveSearchResult>();
  for (const result of [...localResults, ...cloudResults]) {
    const current = merged.get(result.document.id);
    const freshness = current
      ? compareArchiveFreshness(result.document, current.document)
      : 1;
    const sameRevision = current?.document.contentHash === result.document.contentHash;
    if (
      !current ||
      freshness > 0 ||
      (freshness === 0 && sameRevision && result.storage === "cloud")
    ) {
      merged.set(result.document.id, result);
    }
  }
  return [...merged.values()]
    .sort((left, right) =>
      right.score !== left.score
        ? right.score - left.score
        : Date.parse(right.document.archivedAt) - Date.parse(left.document.archivedAt)
    )
    .slice(0, limit);
}

export async function searchLocalArchivedDocuments(
  query: string,
  limit: number,
  ownerScope: string
): Promise<KnowledgeArchiveSearchResult[]> {
  const local = await loadArchiveFromIndexedDb(ownerScope);
  return searchArchiveIndex(local.documents, local.chunks, query, limit);
}

export async function searchArchivedDocuments(
  query: string,
  ownerScope: string,
  limit = 20
): Promise<ArchiveSearchResponse> {
  const localResults = await searchLocalArchivedDocuments(query, limit, ownerScope);
  let cloudResults: KnowledgeArchiveSearchResult[] = [];
  let cloudAvailable = false;

  try {
    const response = await fetch("/api/knowledge/archive/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
    if (response.ok) {
      const payload = (await response.json()) as { results?: KnowledgeArchiveSearchResult[] };
      cloudResults = Array.isArray(payload.results) ? payload.results : [];
      cloudAvailable = true;
    }
  } catch {
    // 네트워크가 없으면 IndexedDB 검색 결과만 표시합니다.
  }

  return {
    results: mergeArchiveSearchResults(localResults, cloudResults, limit),
    cloudAvailable,
  };
}

export async function loadArchivedDocument(
  summary: KnowledgeArchiveDocument,
  ownerScope: string
): Promise<KnowledgeArchiveDocument> {
  const local = await getArchiveDocument(ownerScope, summary.id);
  if (
    local?.content &&
    (local.contentHash === summary.contentHash || compareArchiveFreshness(local, summary) > 0)
  ) return local;

  const response = await fetch("/api/knowledge/archive/document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: summary.id }),
  });
  if (!response.ok) throw new Error("클라우드 아카이브 원문을 불러오지 못했습니다.");
  const payload = (await response.json()) as { document?: KnowledgeArchiveDocument };
  if (!payload.document?.content) throw new Error("보관된 문서 원문이 비어 있습니다.");
  const chunks = chunkArchiveContent(payload.document.id, payload.document.content);
  await saveArchiveToIndexedDb(ownerScope, payload.document, chunks);
  return payload.document;
}
