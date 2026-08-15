import type {
  AiArtifact,
  ContentAsset,
  ExpenseEntry,
  ItemRelation,
  WorkspaceItem,
} from "./contracts";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateExpenseEntry(entry: Partial<ExpenseEntry>): ValidationResult {
  const errors: string[] = [];

  if (!entry.itemId || typeof entry.itemId !== "string") {
    errors.push("itemId가 필요합니다.");
  }

  if (typeof entry.amount !== "string" || !/^\d+(\.\d+)?$/.test(entry.amount.trim())) {
    errors.push("유효한 숫자 형식의 amount 문자열이 필요합니다.");
  } else {
    const num = Number(entry.amount);
    if (num < 0 || !Number.isFinite(num)) {
      errors.push("amount는 0 이상의 유한한 숫자여야 합니다.");
    }
  }

  if (typeof entry.currency !== "string" || !/^[A-Z]{3}$/.test(entry.currency.trim())) {
    errors.push("currency는 ISO 4217 3자리 대문자 형식이어야 합니다 (예: KRW, USD).");
  }

  if (!entry.occurredAt || Number.isNaN(Date.parse(entry.occurredAt))) {
    errors.push("유효한 ISO 8601 형식의 occurredAt 시각이 필요합니다.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateItemRelation(relation: Partial<ItemRelation>): ValidationResult {
  const errors: string[] = [];

  if (!relation.fromItemId || typeof relation.fromItemId !== "string") {
    errors.push("fromItemId가 필요합니다.");
  }
  if (!relation.toItemId || typeof relation.toItemId !== "string") {
    errors.push("toItemId가 필요합니다.");
  }

  if (relation.fromItemId && relation.toItemId && relation.fromItemId === relation.toItemId) {
    errors.push("fromItemId와 toItemId는 동일할 수 없습니다 (자기 참조 관계 금지).");
  }

  if (!relation.relationType || typeof relation.relationType !== "string") {
    errors.push("relationType이 필요합니다.");
  }

  if (!relation.createdBy || !["user", "rule", "ai"].includes(relation.createdBy)) {
    errors.push("createdBy는 'user', 'rule', 'ai' 중 하나여야 합니다.");
  }

  if (relation.confidence !== undefined) {
    if (typeof relation.confidence !== "number" || relation.confidence < 0 || relation.confidence > 1) {
      errors.push("confidence는 0 이상 1 이하의 숫자여야 합니다.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateAiArtifact(artifact: Partial<AiArtifact>): ValidationResult {
  const errors: string[] = [];

  if (!artifact.itemId || typeof artifact.itemId !== "string") {
    errors.push("itemId가 필요합니다.");
  }
  if (!artifact.artifactType || typeof artifact.artifactType !== "string") {
    errors.push("artifactType이 필요합니다.");
  }
  if (!artifact.provider || typeof artifact.provider !== "string") {
    errors.push("provider가 필요합니다.");
  }
  if (!artifact.model || typeof artifact.model !== "string") {
    errors.push("model이 필요합니다.");
  }

  const hasText = typeof artifact.contentText === "string" && artifact.contentText.trim().length > 0;
  const hasJson = artifact.contentJson !== undefined && artifact.contentJson !== null && typeof artifact.contentJson === "object";

  if (!hasText && !hasJson) {
    errors.push("contentText 또는 contentJson 중 하나 이상의 결과 내용이 필요합니다.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateContentAsset(asset: Partial<ContentAsset>): ValidationResult {
  const errors: string[] = [];

  if (!asset.itemId || typeof asset.itemId !== "string") {
    errors.push("itemId가 필요합니다.");
  }
  if (!asset.kind || !["document", "image", "audio", "raw_text"].includes(asset.kind)) {
    errors.push("유효한 kind가 필요합니다 ('document', 'image', 'audio', 'raw_text').");
  }
  if (!asset.provider || !["supabase", "google_drive", "local_indexeddb", "external_url"].includes(asset.provider)) {
    errors.push("유효한 provider가 필요합니다 ('supabase', 'google_drive', 'local_indexeddb', 'external_url').");
  }
  if (!asset.providerRef || typeof asset.providerRef !== "string") {
    errors.push("providerRef가 필요합니다.");
  } else if (asset.provider === "external_url") {
    try {
      const url = new URL(asset.providerRef);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        errors.push("external_url providerRef는 http 또는 https 주소여야 합니다.");
      }
    } catch {
      errors.push("external_url providerRef는 유효한 URL이어야 합니다.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateWorkspaceItem(item: Partial<WorkspaceItem>): ValidationResult {
  const errors: string[] = [];

  if (!item.id || typeof item.id !== "string") {
    errors.push("id가 필요합니다.");
  }
  if (!item.title || typeof item.title !== "string") {
    errors.push("title이 필요합니다.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
