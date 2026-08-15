import type { WorkspaceItem, ItemRelation } from "../data/contracts";
import type {
  GroundedContextPackage,
  KnowledgeEvidence,
  KnowledgeSearchRequest,
  StructuredFact,
} from "./contracts";
import { filterItemsByExecutionPolicy } from "./policy";

/**
 * 쿼리 단어들과 텍스트의 매칭 점수를 계산합니다 (0 ~ 1).
 */
function calculateKeywordScore(queryWords: string[], text: string): number {
  if (queryWords.length === 0 || !text) return 0;
  const lower = text.toLowerCase();
  let matches = 0;
  for (const word of queryWords) {
    if (lower.includes(word)) {
      matches++;
    }
  }
  return matches / queryWords.length;
}

/**
 * 자료 목록과 관계 목록에서 질문에 가장 적합한 근거(Evidence)를 검색하고 패키징합니다.
 */
export function searchKnowledge(
  items: WorkspaceItem[],
  relations: ItemRelation[],
  request: KnowledgeSearchRequest
): GroundedContextPackage {
  const { allowed, excludedCount } = filterItemsByExecutionPolicy(
    items,
    request.executionPolicy
  );

  const queryWords = request.query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const evidences: KnowledgeEvidence[] = [];
  const structuredFacts: StructuredFact[] = [];

  // 1. 관계 기반 탐색 (relatedTo가 있는 경우 우선 매칭)
  const relatedItemIds = new Set<string>();
  if (request.relatedTo) {
    for (const rel of relations) {
      if (!rel.deletedAt) {
        if (rel.fromItemId === request.relatedTo) relatedItemIds.add(rel.toItemId);
        if (rel.toItemId === request.relatedTo) relatedItemIds.add(rel.fromItemId);
      }
    }
  }

  for (const item of allowed) {
    // 유형 필터 검사
    if (request.itemTypes && request.itemTypes.length > 0) {
      if (!request.itemTypes.includes(item.itemType)) continue;
    }

    const fullContent = `${item.title} ${item.content || ""} ${item.rawContent || ""} ${item.workNote || ""}`;
    const kwScore = calculateKeywordScore(queryWords, fullContent);
    const isDirectlyRelated = relatedItemIds.has(item.id);

    let score = kwScore;
    let scoreReason: KnowledgeEvidence["scoreReason"] = "keyword";

    if (isDirectlyRelated) {
      score = Math.max(score, 0.9);
      scoreReason = "relation";
    }

    if (score > 0.1 || isDirectlyRelated) {
      evidences.push({
        itemId: item.id,
        title: item.title,
        excerpt: (item.content || item.rawContent || item.title).slice(0, 300),
        sourceVersion: item.version || 1,
        updatedAt: item.updatedAt || item.created_at,
        score,
        scoreReason,
      });

      // 구조화 사실 등록
      if (item.attributes && typeof item.attributes === "object") {
        for (const [key, value] of Object.entries(item.attributes)) {
          if (value !== null && value !== undefined && typeof value !== "object") {
            structuredFacts.push({
              key: `${item.title} - ${key}`,
              value: String(value),
              itemId: item.id,
              userConfirmed: true,
            });
          }
        }
      }
    }
  }

  // 점수 및 최신순 정렬
  evidences.sort((a, b) => b.score - a.score);

  const limit = request.limit || 5;
  const slicedEvidences = evidences.slice(0, limit);

  return {
    question: request.query,
    evidence: slicedEvidences,
    structuredFacts: structuredFacts.slice(0, 10),
    excluded: excludedCount > 0 ? [{ reason: "privacy", count: excludedCount }] : [],
  };
}
