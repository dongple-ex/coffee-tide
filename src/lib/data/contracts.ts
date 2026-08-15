import type { UnifiedData } from "../types/unified";

export type WorkspaceItemType =
  | "task"
  | "note"
  | "meeting"
  | "expense"
  | "document"
  | "voice"
  | "briefing"
  | "reference";

export type PrivacyScope = "local_only" | "cloud_private" | "external_allowed";
export type AiPolicy = "disabled" | "local_only" | "cloud_allowed";

export interface WorkspaceItem extends UnifiedData {
  itemType: WorkspaceItemType;
  sourceRef?: string;
  occurredAt?: string;
  attributes?: Record<string, unknown>;
  version: number;
  deletedAt?: string;
  privacyScope: PrivacyScope;
  aiPolicy: AiPolicy;
  updatedAt: string;
}

export interface ExpenseEntry {
  itemId: string;
  userId?: string;
  amount: string; // JavaScript 부동소수점 오차 방지를 위해 문자열 전달 (DB NUMERIC)
  currency: string; // ISO 4217 3자리 대문자 (예: KRW, USD)
  merchant?: string;
  category?: string;
  paymentMethod?: string;
  occurredAt: string;
  receiptAssetId?: string;
  projectItemId?: string;
  taxDeductible: boolean;
  reimbursable: boolean;
}

export type ContentAssetKind = "document" | "image" | "audio" | "raw_text";
export type ContentAssetProvider =
  | "supabase"
  | "google_drive"
  | "local_indexeddb"
  | "external_url";
export type ContentRetentionPolicy =
  | "transient"
  | "user_kept"
  | "source_owned"
  | "local_only";

export interface ContentAsset {
  id: string;
  userId?: string;
  itemId: string;
  kind: ContentAssetKind;
  provider: ContentAssetProvider;
  providerRef: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  retentionPolicy: ContentRetentionPolicy;
  expiresAt?: string;
  createdAt: string;
  deletedAt?: string;
}

export type RelationType =
  | "derived_from"
  | "contains_task"
  | "expense_for"
  | "attachment_of"
  | "follow_up_of"
  | "related_to"
  | "supersedes"
  | (string & {});

export type RelationCreatedBy = "user" | "rule" | "ai";

export interface ItemRelation {
  id: string;
  userId?: string;
  fromItemId: string;
  toItemId: string;
  relationType: RelationType;
  createdBy: RelationCreatedBy;
  confidence?: number; // 0 ~ 1
  evidence?: Record<string, unknown>;
  confirmedAt?: string;
  createdAt: string;
  deletedAt?: string;
}

export type AiArtifactType =
  | "transcription"
  | "summary"
  | "task_extract"
  | "expense_extract"
  | "tags"
  | "briefing";

export type AiArtifactStatus = "current" | "stale" | "rejected" | "accepted";

export interface AiArtifact {
  id: string;
  userId?: string;
  itemId: string;
  artifactType: AiArtifactType;
  contentText?: string;
  contentJson?: Record<string, unknown>;
  provider: string;
  model: string;
  promptVersion?: string;
  sourceHash?: string;
  sourceVersion?: number;
  status: AiArtifactStatus;
  createdAt: string;
  acceptedAt?: string;
  deletedAt?: string;
}
