import type { CanvasDocument, CanvasDocType } from "@/lib/canvas/types";
import type { AiPolicy, PrivacyScope } from "@/lib/data/contracts";
import { expandSearchTerms, extractArchiveKeywords } from "./vocabulary";

export type ArchiveStorage = "local" | "cloud";
export type ArchiveSourceKind = "canvas" | "workspace_item";
export type ArchiveContentProvider = "local" | "supabase" | "google_drive";

export interface KnowledgeArchiveDocument {
  id: string;
  sourceKind: ArchiveSourceKind;
  sourceId: string;
  title: string;
  docType: CanvasDocType;
  content: string;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string;
  version: number;
  chunkCount: number;
  contentProvider?: ArchiveContentProvider;
  driveFileId?: string;
  driveUrl?: string;
  privacyScope: PrivacyScope;
  aiPolicy: AiPolicy;
  keywords: string[];
}

export interface KnowledgeArchiveChunk {
  id: string;
  archiveId: string;
  ordinal: number;
  content: string;
  charStart: number;
  charEnd: number;
}

export interface KnowledgeArchiveSearchResult {
  document: KnowledgeArchiveDocument;
  excerpt: string;
  score: number;
  storage: ArchiveStorage;
}

const TARGET_CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 140;

function cleanText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

export function stableContentHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function findChunkEnd(content: string, start: number): number {
  const preferredEnd = Math.min(content.length, start + TARGET_CHUNK_SIZE);
  if (preferredEnd === content.length) return preferredEnd;

  const lowerBound = Math.min(content.length, start + Math.floor(TARGET_CHUNK_SIZE * 0.55));
  const paragraphEnd = content.lastIndexOf("\n\n", preferredEnd);
  if (paragraphEnd >= lowerBound) return paragraphEnd;

  const sentenceCandidates = [". ", "! ", "? ", "。", "다. ", "요. "];
  let sentenceEnd = -1;
  for (const marker of sentenceCandidates) {
    sentenceEnd = Math.max(sentenceEnd, content.lastIndexOf(marker, preferredEnd));
  }
  return sentenceEnd >= lowerBound ? sentenceEnd + 1 : preferredEnd;
}

export function chunkArchiveContent(archiveId: string, rawContent: string): KnowledgeArchiveChunk[] {
  const content = cleanText(rawContent);
  if (!content) return [];

  const chunks: KnowledgeArchiveChunk[] = [];
  let start = 0;
  let ordinal = 0;
  while (start < content.length) {
    const end = findChunkEnd(content, start);
    const chunkText = content.slice(start, end).trim();
    if (chunkText) {
      chunks.push({
        id: `${archiveId}:${ordinal}`,
        archiveId,
        ordinal,
        content: chunkText,
        charStart: start,
        charEnd: end,
      });
      ordinal += 1;
    }
    if (end >= content.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

export function createCanvasArchive(
  document: CanvasDocument,
  previousVersion = 0,
  archivedAt = new Date().toISOString()
): { document: KnowledgeArchiveDocument; chunks: KnowledgeArchiveChunk[] } {
  const id = `archive:canvas:${document.id}`;
  const content = cleanText(document.content);
  const chunks = chunkArchiveContent(id, content);
  return {
    document: {
      id,
      sourceKind: "canvas",
      sourceId: document.id,
      title: document.title.trim() || "제목 없는 문서",
      docType: document.type,
      content,
      contentHash: stableContentHash(`${document.title}\n${content}`),
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      archivedAt,
      version: Math.max(1, previousVersion + 1),
      chunkCount: chunks.length,
      contentProvider: "local",
      privacyScope: "cloud_private",
      aiPolicy: "cloud_allowed",
      keywords: extractArchiveKeywords(document.title, content),
    },
    chunks,
  };
}

function excerptAroundMatch(content: string, terms: string[]): string {
  const lower = content.toLocaleLowerCase("ko-KR");
  const firstMatch = terms.reduce((best, term) => {
    const index = lower.indexOf(term);
    return index >= 0 && (best < 0 || index < best) ? index : best;
  }, -1);
  const start = Math.max(0, (firstMatch < 0 ? 0 : firstMatch) - 90);
  const end = Math.min(content.length, start + 300);
  return `${start > 0 ? "…" : ""}${content.slice(start, end).trim()}${end < content.length ? "…" : ""}`;
}

export function searchArchiveIndex(
  documents: KnowledgeArchiveDocument[],
  chunks: KnowledgeArchiveChunk[],
  query: string,
  limit = 20
): KnowledgeArchiveSearchResult[] {
  const terms = expandSearchTerms(query);
  const originalTerms = expandSearchTerms(query, []);
  const chunksByArchive = new Map<string, KnowledgeArchiveChunk[]>();
  for (const chunk of chunks) {
    const group = chunksByArchive.get(chunk.archiveId) ?? [];
    group.push(chunk);
    chunksByArchive.set(chunk.archiveId, group);
  }

  return documents
    .map<KnowledgeArchiveSearchResult | null>((document) => {
      const documentChunks = chunksByArchive.get(document.id) ?? [];
      if (terms.length === 0) {
        return {
          document,
          excerpt: documentChunks[0]?.content.slice(0, 300) || document.content.slice(0, 300),
          score: 0,
          storage: "local" as const,
        };
      }

      const title = document.title.toLocaleLowerCase("ko-KR");
      const keywordText = (document.keywords ?? []).join(" ").toLocaleLowerCase("ko-KR");
      let bestScore = 0;
      let bestContent = document.content;
      for (const chunk of documentChunks) {
        const haystack = chunk.content.toLocaleLowerCase("ko-KR");
        const matched = terms.filter((term) => haystack.includes(term)).length;
        const titleMatched = terms.filter((term) => title.includes(term)).length;
        const keywordMatched = terms.filter((term) => keywordText.includes(term)).length;
        const originalMatched = originalTerms.filter((term) => haystack.includes(term)).length;
        const phraseBonus = haystack.includes(query.toLocaleLowerCase("ko-KR").trim()) ? 0.25 : 0;
        const score = matched / terms.length
          + (titleMatched / terms.length) * 0.7
          + (keywordMatched / terms.length) * 0.45
          + (originalTerms.length > 0 ? originalMatched / originalTerms.length : 0) * 0.5
          + phraseBonus;
        if (score > bestScore) {
          bestScore = score;
          bestContent = chunk.content;
        }
      }
      if (bestScore === 0) return null;
      return {
        document,
        excerpt: excerptAroundMatch(bestContent, terms),
        score: bestScore,
        storage: "local" as const,
      };
    })
    .filter((result): result is KnowledgeArchiveSearchResult => result !== null)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return Date.parse(right.document.archivedAt) - Date.parse(left.document.archivedAt);
    })
    .slice(0, Math.max(1, Math.min(limit, 50)));
}
