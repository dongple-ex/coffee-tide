import type { UnifiedCategory, UnifiedData, UnifiedSource, SubTask } from "../types/unified";
import type {
  AiArtifact,
  AiArtifactStatus,
  AiArtifactType,
  ContentAsset,
  ContentAssetKind,
  ContentAssetProvider,
  ContentRetentionPolicy,
  ExpenseEntry,
  ItemRelation,
  RelationCreatedBy,
  RelationType,
  WorkspaceItem,
  WorkspaceItemType,
} from "./contracts";

type DbRow = Record<string, unknown>;

/**
 * DB unified_items 행을 WorkspaceItem (UnifiedData 호환) 객체로 변환합니다.
 * 구 버전 행(컬럼 누락)도 안전한 기본값으로 복원하며, rawContent / driveUrl / attributes를 보존합니다.
 */
export function mapUnifiedItemFromDb(row: DbRow): WorkspaceItem {
  const author = (row.author as { name: string; email?: string }) || { name: "System" };
  const subTasks = Array.isArray(row.sub_tasks) ? (row.sub_tasks as SubTask[]) : undefined;
  const attributes =
    row.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes)
      ? (row.attributes as Record<string, unknown>)
      : {};

  return {
    id: String(row.id),
    source: (row.source as UnifiedSource) || "manual",
    sourceApp: row.source_app ? String(row.source_app) : undefined,
    title: String(row.title || ""),
    content: String(row.content || ""),
    created_at: String(row.created_at || new Date().toISOString()),
    author,
    url: String(row.url || ""),
    category: row.category ? (row.category as UnifiedCategory) : undefined,
    actionDirective: row.action_directive ? String(row.action_directive) : undefined,
    status: row.status ? (row.status as UnifiedData["status"]) : "pending",
    workNote: row.work_note ? String(row.work_note) : undefined,
    subTasks,
    rawContent: row.raw_content ? String(row.raw_content) : undefined,
    driveUrl: row.drive_url ? String(row.drive_url) : undefined,

    // Phase 14-02 확장 필드
    itemType: (row.item_type as WorkspaceItemType) || "task",
    sourceRef: row.source_ref ? String(row.source_ref) : undefined,
    occurredAt: row.occurred_at ? String(row.occurred_at) : undefined,
    attributes,
    version: typeof row.version === "number" ? row.version : Number(row.version) || 1,
    deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
    privacyScope: (row.privacy_scope as WorkspaceItem["privacyScope"]) || "cloud_private",
    aiPolicy: (row.ai_policy as WorkspaceItem["aiPolicy"]) || "cloud_allowed",
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

/**
 * UnifiedData 또는 WorkspaceItem 객체를 DB unified_items 저장용 snake_case 레코드로 변환합니다.
 */
export function mapUnifiedItemToDbRow(
  item: UnifiedData | WorkspaceItem,
  userId: string
): Record<string, unknown> {
  const wsItem = item as Partial<WorkspaceItem>;
  const nowIso = new Date().toISOString();

  return {
    user_id: userId,
    id: item.id,
    source: item.source,
    source_app: item.sourceApp ?? null,
    title: item.title,
    content: item.content ?? "",
    created_at: item.created_at || nowIso,
    author: item.author ?? { name: "System" },
    url: item.url ?? "",
    category: item.category ?? null,
    action_directive: item.actionDirective ?? null,
    status: item.status ?? "pending",
    work_note: item.workNote ?? null,
    sub_tasks: item.subTasks ?? null,
    raw_content: item.rawContent ?? null,
    drive_url: item.driveUrl ?? null,

    // Phase 14-02 확장 컬럼
    item_type: wsItem.itemType ?? "task",
    source_ref: wsItem.sourceRef ?? null,
    occurred_at: wsItem.occurredAt ?? null,
    attributes: wsItem.attributes ?? {},
    version: wsItem.version ?? 1,
    privacy_scope: wsItem.privacyScope ?? "cloud_private",
    ai_policy: wsItem.aiPolicy ?? "cloud_allowed",
    deleted_at: wsItem.deletedAt ?? null,
    updated_at: wsItem.updatedAt ?? nowIso,
  };
}

/**
 * DB expense_entries 행 ↔ ExpenseEntry 변환
 */
export function mapExpenseEntryFromDb(row: DbRow): ExpenseEntry {
  return {
    itemId: String(row.item_id),
    userId: row.user_id ? String(row.user_id) : undefined,
    amount: String(row.amount),
    currency: String(row.currency || "KRW"),
    merchant: row.merchant ? String(row.merchant) : undefined,
    category: row.category ? String(row.category) : undefined,
    paymentMethod: row.payment_method ? String(row.payment_method) : undefined,
    occurredAt: String(row.occurred_at),
    receiptAssetId: row.receipt_asset_id ? String(row.receipt_asset_id) : undefined,
    projectItemId: row.project_item_id ? String(row.project_item_id) : undefined,
    taxDeductible: Boolean(row.tax_deductible),
    reimbursable: Boolean(row.reimbursable),
  };
}

export function mapExpenseEntryToDbRow(entry: ExpenseEntry, userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    item_id: entry.itemId,
    amount: entry.amount,
    currency: entry.currency,
    merchant: entry.merchant ?? null,
    category: entry.category ?? null,
    payment_method: entry.paymentMethod ?? null,
    occurred_at: entry.occurredAt,
    receipt_asset_id: entry.receiptAssetId ?? null,
    project_item_id: entry.projectItemId ?? null,
    tax_deductible: entry.taxDeductible,
    reimbursable: entry.reimbursable,
  };
}

/**
 * DB content_assets 행 ↔ ContentAsset 변환
 */
export function mapContentAssetFromDb(row: DbRow): ContentAsset {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : undefined,
    itemId: String(row.item_id),
    kind: row.kind as ContentAssetKind,
    provider: row.provider as ContentAssetProvider,
    providerRef: String(row.provider_ref),
    mimeType: row.mime_type ? String(row.mime_type) : undefined,
    sizeBytes: typeof row.size_bytes === "number" ? row.size_bytes : undefined,
    sha256: row.sha256 ? String(row.sha256) : undefined,
    retentionPolicy: (row.retention_policy as ContentRetentionPolicy) || "user_kept",
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    createdAt: String(row.created_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
  };
}

export function mapContentAssetToDbRow(asset: ContentAsset, userId: string): Record<string, unknown> {
  return {
    id: asset.id,
    user_id: userId,
    item_id: asset.itemId,
    kind: asset.kind,
    provider: asset.provider,
    provider_ref: asset.providerRef,
    mime_type: asset.mimeType ?? null,
    size_bytes: asset.sizeBytes ?? null,
    sha256: asset.sha256 ?? null,
    retention_policy: asset.retentionPolicy,
    expires_at: asset.expiresAt ?? null,
    created_at: asset.createdAt,
    deleted_at: asset.deletedAt ?? null,
  };
}

/**
 * DB item_relations 행 ↔ ItemRelation 변환
 */
export function mapItemRelationFromDb(row: DbRow): ItemRelation {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : undefined,
    fromItemId: String(row.from_item_id),
    toItemId: String(row.to_item_id),
    relationType: row.relation_type as RelationType,
    createdBy: (row.created_by as RelationCreatedBy) || "user",
    confidence: typeof row.confidence === "number" ? row.confidence : undefined,
    evidence: row.evidence && typeof row.evidence === "object" ? (row.evidence as Record<string, unknown>) : undefined,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : undefined,
    createdAt: String(row.created_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
  };
}

export function mapItemRelationToDbRow(relation: ItemRelation, userId: string): Record<string, unknown> {
  return {
    id: relation.id,
    user_id: userId,
    from_item_id: relation.fromItemId,
    to_item_id: relation.toItemId,
    relation_type: relation.relationType,
    created_by: relation.createdBy,
    confidence: relation.confidence ?? null,
    evidence: relation.evidence ?? null,
    confirmed_at: relation.confirmedAt ?? null,
    created_at: relation.createdAt,
    deleted_at: relation.deletedAt ?? null,
  };
}

/**
 * DB ai_artifacts 행 ↔ AiArtifact 변환
 */
export function mapAiArtifactFromDb(row: DbRow): AiArtifact {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : undefined,
    itemId: String(row.item_id),
    artifactType: row.artifact_type as AiArtifactType,
    contentText: row.content_text ? String(row.content_text) : undefined,
    contentJson: row.content_json && typeof row.content_json === "object" ? (row.content_json as Record<string, unknown>) : undefined,
    provider: String(row.provider),
    model: String(row.model),
    promptVersion: row.prompt_version ? String(row.prompt_version) : undefined,
    sourceHash: row.source_hash ? String(row.source_hash) : undefined,
    sourceVersion: typeof row.source_version === "number" ? row.source_version : undefined,
    status: (row.status as AiArtifactStatus) || "current",
    createdAt: String(row.created_at),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : undefined,
    deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
  };
}

export function mapAiArtifactToDbRow(artifact: AiArtifact, userId: string): Record<string, unknown> {
  return {
    id: artifact.id,
    user_id: userId,
    item_id: artifact.itemId,
    artifact_type: artifact.artifactType,
    content_text: artifact.contentText ?? null,
    content_json: artifact.contentJson ?? null,
    provider: artifact.provider,
    model: artifact.model,
    prompt_version: artifact.promptVersion ?? null,
    source_hash: artifact.sourceHash ?? null,
    source_version: artifact.sourceVersion ?? null,
    status: artifact.status,
    created_at: artifact.createdAt,
    accepted_at: artifact.acceptedAt ?? null,
    deleted_at: artifact.deletedAt ?? null,
  };
}
