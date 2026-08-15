import type { ContentAsset } from "../data/contracts";
import { validateContentAsset } from "../data/validation";

export interface CreateAssetInput {
  itemId: string;
  kind: ContentAsset["kind"];
  provider: ContentAsset["provider"];
  providerRef: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  retentionPolicy?: ContentAsset["retentionPolicy"];
}

export function buildContentAsset(
  input: CreateAssetInput,
  userId?: string
): ContentAsset {
  const asset: ContentAsset = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "asset-" + Math.random().toString(36).substring(2, 12),
    userId,
    itemId: input.itemId,
    kind: input.kind,
    provider: input.provider,
    providerRef: input.providerRef,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    sha256: input.sha256,
    retentionPolicy: input.retentionPolicy || "user_kept",
    createdAt: new Date().toISOString(),
  };

  const validation = validateContentAsset(asset);
  if (!validation.valid) {
    throw new Error(`자산 유효성 검증 실패: ${validation.errors.join(", ")}`);
  }

  return asset;
}
