import type { ContentChunk } from "./contracts";
import type { WorkspaceItem } from "../data/contracts";

export interface ChunkOptions {
  maxChunkLength?: number;
  overlapLength?: number;
}

/**
 * 긴 본문 텍스트를 지정된 크기로 분할하고 청크 메타데이터를 생성합니다.
 */
export function chunkDocumentText(
  item: WorkspaceItem,
  rawText: string,
  options: ChunkOptions = {}
): ContentChunk[] {
  const maxLength = options.maxChunkLength || 500;
  const overlap = options.overlapLength || 50;

  const chunks: ContentChunk[] = [];
  const text = rawText.trim();
  if (!text) return chunks;

  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = "";
  let ordinal = 0;
  let estimatedPage = 1;

  for (const para of paragraphs) {
    if ((currentChunk + "\n\n" + para).length > maxLength && currentChunk.length > 0) {
      chunks.push({
        id: `${item.id}-chunk-${ordinal}`,
        userId: "system",
        itemId: item.id,
        ordinal,
        text: currentChunk.trim(),
        sourceLocation: { page: estimatedPage },
        sourceHash: "hash-" + currentChunk.length,
        sourceVersion: item.version || 1,
        privacyScope: item.privacyScope,
        aiPolicy: item.aiPolicy,
      });

      ordinal++;
      estimatedPage = Math.floor(ordinal / 3) + 1;
      currentChunk = currentChunk.slice(-overlap) + "\n\n" + para;
    } else {
      currentChunk = currentChunk.length > 0 ? currentChunk + "\n\n" + para : para;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: `${item.id}-chunk-${ordinal}`,
      userId: "system",
      itemId: item.id,
      ordinal,
      text: currentChunk.trim(),
      sourceLocation: { page: estimatedPage },
      sourceHash: "hash-" + currentChunk.length,
      sourceVersion: item.version || 1,
      privacyScope: item.privacyScope,
      aiPolicy: item.aiPolicy,
    });
  }

  return chunks;
}
