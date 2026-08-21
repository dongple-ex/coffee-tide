import type { WorkspaceItem } from "../data/contracts";
import type {
  MutationOperation,
  SyncConflict,
  SyncMutation,
  SyncMutationsResponse,
} from "../sync/contracts";
import {
  idbGetMeta,
  idbGetMutations,
  idbDeleteItems,
  idbRemoveConflict,
  idbRemoveMutations,
  idbSaveConflict,
  idbSaveItems,
  idbSaveMutation,
  idbSetMeta,
} from "./workspaceDb";
import { generateId } from "../ids";

function generateUUID(): string {
  return generateId("mut");
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await idbGetMeta("deviceId");
  if (existing) return existing;

  const newId = "dev-" + generateUUID();
  await idbSetMeta("deviceId", newId);
  return newId;
}

export async function queueMutation(
  itemId: string,
  operation: MutationOperation,
  baseVersion?: number,
  payload?: Partial<WorkspaceItem>
): Promise<SyncMutation> {
  const deviceId = await getOrCreateDeviceId();
  const existing = (await idbGetMutations())
    .filter((mutation) => mutation.itemId === itemId)
    .sort((a, b) => a.clientCreatedAt.localeCompare(b.clientCreatedAt));

  const pendingCreate = existing.find((mutation) => mutation.operation === "create");
  if (operation === "update" && pendingCreate) {
    const mergedCreate: SyncMutation = {
      ...pendingCreate,
      payload: { ...(pendingCreate.payload || {}), ...(payload || {}) },
    };
    await idbSaveMutation(mergedCreate);
    return mergedCreate;
  }

  const pendingUpdate = [...existing].reverse().find((mutation) => mutation.operation === "update");
  if (operation === "update" && pendingUpdate) {
    const mergedUpdate: SyncMutation = {
      ...pendingUpdate,
      baseVersion: pendingUpdate.baseVersion ?? baseVersion,
      payload: { ...(pendingUpdate.payload || {}), ...(payload || {}) },
    };
    await idbSaveMutation(mergedUpdate);
    return mergedUpdate;
  }

  const pendingDelete = existing.find((mutation) => mutation.operation === "delete");
  if (operation === "delete" && pendingDelete) return pendingDelete;

  if (operation === "delete" && existing.length > 0) {
    const obsoleteUpdates = existing
      .filter((mutation) => mutation.operation === "update")
      .map((mutation) => mutation.mutationId);
    if (obsoleteUpdates.length > 0) await idbRemoveMutations(obsoleteUpdates);
  }

  const mutation: SyncMutation = {
    mutationId: generateUUID(),
    deviceId,
    itemId,
    operation,
    baseVersion,
    payload,
    clientCreatedAt: new Date().toISOString(),
  };

  await idbSaveMutation(mutation);
  return mutation;
}

export interface FlushResult {
  sentCount: number;
  appliedCount: number;
  duplicateCount: number;
  conflictCount: number;
  rejectedCount: number;
  conflicts: SyncConflict[];
}

export async function flushMutationQueue(
  currentItems: WorkspaceItem[]
): Promise<FlushResult> {
  const mutations = (await idbGetMutations()).sort((a, b) =>
    a.clientCreatedAt.localeCompare(b.clientCreatedAt)
  );
  if (mutations.length === 0) {
    return {
      sentCount: 0,
      appliedCount: 0,
      duplicateCount: 0,
      conflictCount: 0,
      rejectedCount: 0,
      conflicts: [],
    };
  }

  const itemsMap = new Map(currentItems.map((i) => [i.id, i]));
  const conflictsFound: SyncConflict[] = [];

  try {
    const res = await fetch("/api/sync/mutations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mutations }),
    });

    if (!res.ok) {
      throw new Error(`Sync mutations HTTP error: ${res.status}`);
    }

    const data: SyncMutationsResponse = await res.json();
    const appliedIds: string[] = [];
    let appliedCount = 0;
    let duplicateCount = 0;
    let conflictCount = 0;
    let rejectedCount = 0;

    for (const result of data.results) {
      if (result.status === "applied" || result.status === "duplicate") {
        appliedIds.push(result.mutationId);
        if (result.status === "applied") appliedCount++;
        if (result.status === "duplicate") duplicateCount++;
        if (result.serverItem?.deletedAt) {
          await idbDeleteItems([result.serverItem.id]);
        } else if (result.serverItem) {
          await idbSaveItems([result.serverItem]);
        }
      } else if (result.status === "conflict" && result.serverItem) {
        conflictCount++;
        const mutation = mutations.find((m) => m.mutationId === result.mutationId);
        if (mutation) {
          const localItem = itemsMap.get(mutation.itemId) || {
            id: mutation.itemId,
            source: "manual",
            title: mutation.payload?.title || "",
            content: mutation.payload?.content || "",
            created_at: new Date().toISOString(),
            author: { name: "User" },
            url: "",
            version: mutation.baseVersion || 1,
            itemType: "task",
            privacyScope: "cloud_private",
            aiPolicy: "cloud_allowed",
            updatedAt: new Date().toISOString(),
          };

          const conflict: SyncConflict = {
            itemId: mutation.itemId,
            localItem,
            serverItem: result.serverItem,
            detectedAt: new Date().toISOString(),
            resolved: false,
          };
          conflictsFound.push(conflict);
          await idbSaveConflict(conflict);
        }
      } else {
        rejectedCount++;
      }
    }

    if (appliedIds.length > 0) {
      await idbRemoveMutations(appliedIds);
    }

    return {
      sentCount: mutations.length,
      appliedCount,
      duplicateCount,
      conflictCount,
      rejectedCount,
      conflicts: conflictsFound,
    };
  } catch {
    return {
      sentCount: mutations.length,
      appliedCount: 0,
      duplicateCount: 0,
      conflictCount: 0,
      rejectedCount: mutations.length,
      conflicts: [],
    };
  }
}

export async function resolveConflictInQueue(itemId: string): Promise<void> {
  const pending = await idbGetMutations();
  const staleMutationIds = pending
    .filter((mutation) => mutation.itemId === itemId)
    .map((mutation) => mutation.mutationId);
  if (staleMutationIds.length > 0) {
    await idbRemoveMutations(staleMutationIds);
  }
  await idbRemoveConflict(itemId);
}
