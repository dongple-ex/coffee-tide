import type { ItemRelation, RelationCreatedBy, RelationType } from "../data/contracts";
import { validateItemRelation } from "../data/validation";
import { generateId } from "../ids";

export interface CreateRelationInput {
  fromItemId: string;
  toItemId: string;
  relationType: RelationType;
  createdBy?: RelationCreatedBy;
  confidence?: number;
  evidence?: Record<string, unknown>;
}

export function buildItemRelation(
  input: CreateRelationInput,
  userId?: string
): ItemRelation {
  const createdBy = input.createdBy || "user";
  const relation: ItemRelation = {
    id: generateId("rel"),
    userId,
    fromItemId: input.fromItemId,
    toItemId: input.toItemId,
    relationType: input.relationType,
    createdBy,
    confidence: input.confidence ?? (createdBy === "user" ? 1.0 : undefined),
    evidence: input.evidence,
    confirmedAt: createdBy === "user" ? new Date().toISOString() : undefined,
    createdAt: new Date().toISOString(),
  };

  const validation = validateItemRelation(relation);
  if (!validation.valid) {
    throw new Error(`관계 유효성 검증 실패: ${validation.errors.join(", ")}`);
  }

  return relation;
}

/**
 * 중복 관계 방지: 동일한 from, to, relationType을 가진 기존 관계가 있는지 검사합니다.
 */
export function hasDuplicateRelation(
  existingRelations: ItemRelation[],
  newRelation: ItemRelation
): boolean {
  return existingRelations.some(
    (r) =>
      !r.deletedAt &&
      r.fromItemId === newRelation.fromItemId &&
      r.toItemId === newRelation.toItemId &&
      r.relationType === newRelation.relationType
  );
}
