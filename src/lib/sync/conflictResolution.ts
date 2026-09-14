import type { WorkspaceItem } from "../data/contracts";
import type { MutationOperation, SyncConflict, SyncConflictChoice } from "./contracts";

export interface ConflictResolutionMutationDraft {
  itemId: string;
  operation: MutationOperation;
  baseVersion?: number;
  payload?: Partial<WorkspaceItem>;
}

export interface ConflictResolutionPlan {
  items: WorkspaceItem[];
  mutation?: ConflictResolutionMutationDraft;
}

export function buildConflictResolutionPlan(
  currentItems: WorkspaceItem[],
  choice: SyncConflictChoice,
  conflict: SyncConflict,
  options: { now: string; copyId: string }
): ConflictResolutionPlan {
  const map = new Map(currentItems.map((item) => [item.id, item]));

  if (choice === "keep_server") {
    if (conflict.serverItem.deletedAt) map.delete(conflict.itemId);
    else map.set(conflict.itemId, conflict.serverItem);
    return { items: Array.from(map.values()) };
  }

  if (choice === "keep_local") {
    const local: WorkspaceItem = {
      ...conflict.localItem,
      version: conflict.serverItem.version + 1,
      updatedAt: options.now,
      deletedAt: undefined,
    };
    map.set(local.id, local);
    return {
      items: Array.from(map.values()),
      mutation: {
        itemId: local.id,
        operation: "update",
        baseVersion: conflict.serverItem.version,
        payload: local,
      },
    };
  }

  if (!conflict.serverItem.deletedAt) map.set(conflict.itemId, conflict.serverItem);
  else map.delete(conflict.itemId);
  const copy: WorkspaceItem = {
    ...conflict.localItem,
    id: options.copyId,
    title: `${conflict.localItem.title} (이 기기 사본)`,
    version: 1,
    created_at: options.now,
    updatedAt: options.now,
    deletedAt: undefined,
    attributes: {
      ...(conflict.localItem.attributes ?? {}),
      conflictSourceId: conflict.itemId,
    },
  };
  map.set(copy.id, copy);
  return {
    items: Array.from(map.values()),
    mutation: {
      itemId: copy.id,
      operation: "create",
      payload: copy,
    },
  };
}
