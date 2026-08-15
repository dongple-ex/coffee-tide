import type { WorkspaceItem } from "../data/contracts";

export type MutationOperation = "create" | "update" | "delete";

export interface SyncMutation {
  mutationId: string;
  deviceId: string;
  itemId: string;
  operation: MutationOperation;
  baseVersion?: number;
  payload?: Partial<WorkspaceItem>;
  clientCreatedAt: string;
}

export interface SyncChangesResponse {
  changes: WorkspaceItem[];
  tombstones: Array<{ id: string; version: number; deletedAt: string }>;
  nextCursor: string;
  hasMore: boolean;
}

export type MutationResultStatus = "applied" | "duplicate" | "conflict" | "rejected";

export interface SyncMutationResult {
  mutationId: string;
  status: MutationResultStatus;
  serverItem?: WorkspaceItem;
  errorCode?: string;
}

export interface SyncMutationsResponse {
  results: SyncMutationResult[];
}

export interface SyncConflict {
  itemId: string;
  localItem: WorkspaceItem;
  serverItem: WorkspaceItem;
  detectedAt: string;
  resolved: boolean;
}

export interface SyncStatusSummary {
  userId?: string;
  deviceId: string;
  pendingMutationCount: number;
  unresolvedConflictCount: number;
  lastSyncedAt?: string;
  lastCursor?: string;
}
