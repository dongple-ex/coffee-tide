"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceItem } from "@/lib/data/contracts";
import type { UnifiedData } from "@/lib/types/unified";
import type { UserCloudState } from "@/lib/db/syncAdapter";
import type { MutationOperation, SyncChangesResponse, SyncConflict } from "@/lib/sync/contracts";
import {
  flushMutationQueue,
  queueMutation,
  resolveConflictInQueue,
  type FlushResult,
} from "@/lib/browser/mutationQueue";
import {
  idbGetConflicts,
  idbGetItems,
  idbGetMutations,
  idbReplaceItems,
  idbSaveConflict,
} from "@/lib/browser/workspaceDb";
import { mergeItemChanges } from "@/lib/sync/merge";

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "guest" | "offline";

export interface SyncHookState {
  syncStatus: SyncStatus;
  provider: "supabase" | "guest";
  lastSyncedAt?: string;
  pendingCount: number;
  errorMessage?: string;
  conflicts: SyncConflict[];
}

const EMPTY_FLUSH_RESULT: FlushResult = {
  sentCount: 0,
  appliedCount: 0,
  duplicateCount: 0,
  conflictCount: 0,
  rejectedCount: 0,
  conflicts: [],
};

function toWorkspaceItem(item: UnifiedData | WorkspaceItem): WorkspaceItem {
  const candidate = item as Partial<WorkspaceItem>;
  return {
    ...item,
    itemType: candidate.itemType ?? "task",
    attributes: candidate.attributes ?? {},
    version: candidate.version ?? 1,
    privacyScope: candidate.privacyScope ?? "cloud_private",
    aiPolicy: candidate.aiPolicy ?? "cloud_allowed",
    updatedAt: candidate.updatedAt ?? item.created_at,
  };
}

function mergeLocalSnapshots(primary: WorkspaceItem[], secondary: WorkspaceItem[]): WorkspaceItem[] {
  const merged = new Map(secondary.map((item) => [item.id, item]));
  for (const item of primary) {
    const other = merged.get(item.id);
    if (!other) {
      merged.set(item.id, item);
      continue;
    }
    const itemTime = Date.parse(item.updatedAt || item.created_at) || 0;
    const otherTime = Date.parse(other.updatedAt || other.created_at) || 0;
    merged.set(item.id, itemTime >= otherTime ? item : other);
  }
  return Array.from(merged.values());
}

function hasItemChanged(previous: WorkspaceItem, next: WorkspaceItem): boolean {
  const comparable = (item: WorkspaceItem) => ({
    title: item.title,
    content: item.content,
    status: item.status,
    category: item.category,
    actionDirective: item.actionDirective,
    workNote: item.workNote,
    subTasks: item.subTasks,
    rawContent: item.rawContent,
    driveUrl: item.driveUrl,
    itemType: item.itemType,
    sourceRef: item.sourceRef,
    occurredAt: item.occurredAt,
    attributes: item.attributes,
    privacyScope: item.privacyScope,
    aiPolicy: item.aiPolicy,
  });
  return JSON.stringify(comparable(previous)) !== JSON.stringify(comparable(next));
}

function mergeByKey<T>(cloud: T[], local: T[], getKey: (item: T) => string): T[] {
  const merged = new Map(cloud.map((item) => [getKey(item), item]));
  for (const item of local) merged.set(getKey(item), item);
  return Array.from(merged.values());
}

export function useCloudSync() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [provider, setProvider] = useState<"supabase" | "guest">("guest");
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();
  const [pendingCount, setPendingCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);

  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const settingsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestSettingsRef = useRef<UserCloudState | null>(null);

  const refreshLocalSyncState = useCallback(async () => {
    const [mutations, storedConflicts] = await Promise.all([
      idbGetMutations(),
      idbGetConflicts(),
    ]);
    setPendingCount(mutations.length);
    setConflicts(storedConflicts.filter((conflict) => !conflict.resolved));
  }, []);

  const pullChanges = useCallback(async (currentLocalItems: WorkspaceItem[]): Promise<WorkspaceItem[]> => {
    if (!navigator.onLine) {
      setSyncStatus("offline");
      return currentLocalItems;
    }

    try {
      const serverItems: WorkspaceItem[] = [];
      const tombstones: SyncChangesResponse["tombstones"] = [];
      let cursor = "";
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams({ limit: "500" });
        if (cursor) params.set("cursor", cursor);
        const res = await fetch(`/api/sync/changes?${params.toString()}`);
        if (res.status === 401) {
          setProvider("guest");
          setSyncStatus("guest");
          return currentLocalItems;
        }
        if (!res.ok) throw new Error(`Sync pull failed: HTTP ${res.status}`);

        const page = (await res.json()) as SyncChangesResponse;
        serverItems.push(...(page.changes || []));
        tombstones.push(...(page.tombstones || []));
        hasMore = Boolean(page.hasMore && page.nextCursor && page.nextCursor !== cursor);
        cursor = page.nextCursor || "";
      }

      setProvider("supabase");
      const pending = await idbGetMutations();
      const pendingIds = new Set(pending.map((mutation) => mutation.itemId));
      const pendingByItem = new Map<string, typeof pending>();
      for (const mutation of pending) {
        const itemMutations = pendingByItem.get(mutation.itemId) ?? [];
        itemMutations.push(mutation);
        pendingByItem.set(mutation.itemId, itemMutations);
      }
      const tombstoneMap = new Map(tombstones.map((item) => [item.id, item]));
      const serverMap = new Map(serverItems.map((item) => [item.id, item]));
      const mergedMap = new Map<string, WorkspaceItem>();
      const newConflicts: SyncConflict[] = [];

      for (const localItem of currentLocalItems) {
        const tombstone = tombstoneMap.get(localItem.id);
        if (tombstone) {
          if (pendingIds.has(localItem.id)) {
            const conflict: SyncConflict = {
              itemId: localItem.id,
              localItem,
              serverItem: {
                ...localItem,
                version: tombstone.version,
                deletedAt: tombstone.deletedAt,
                updatedAt: tombstone.deletedAt,
              },
              detectedAt: new Date().toISOString(),
              resolved: false,
            };
            mergedMap.set(localItem.id, localItem);
            newConflicts.push(conflict);
            await idbSaveConflict(conflict);
          }
          continue;
        }

        const serverItem = serverMap.get(localItem.id);
        if (!serverItem) {
          mergedMap.set(localItem.id, localItem);
          if (!pendingIds.has(localItem.id)) {
            await queueMutation(localItem.id, "create", undefined, localItem);
          }
          continue;
        }

        serverMap.delete(localItem.id);
        const result = mergeItemChanges(localItem, serverItem);
        const itemMutations = pendingByItem.get(localItem.id) ?? [];
        if (itemMutations.length > 0) {
          const hasPendingCreate = itemMutations.some((mutation) => mutation.operation === "create");
          const baseVersions = itemMutations
            .map((mutation) => mutation.baseVersion)
            .filter((version): version is number => version !== undefined);
          const oldestBaseVersion = baseVersions.length > 0 ? Math.min(...baseVersions) : localItem.version;
          const serverAdvanced = serverItem.version > oldestBaseVersion;

          if (serverAdvanced || (hasPendingCreate && result.hasConflict)) {
            const conflict = result.conflict ?? {
              itemId: localItem.id,
              localItem,
              serverItem,
              detectedAt: new Date().toISOString(),
              resolved: false,
            };
            mergedMap.set(localItem.id, localItem);
            newConflicts.push(conflict);
            await idbSaveConflict(conflict);
          } else {
            // 아직 서버에 반영되지 않은 로컬 변경을 pull 결과로 덮어쓰지 않습니다.
            mergedMap.set(localItem.id, localItem);
          }
          continue;
        }

        if (result.hasConflict && result.conflict) {
          if (!pendingIds.has(localItem.id) && serverItem.version > localItem.version) {
            mergedMap.set(localItem.id, serverItem);
          } else {
            mergedMap.set(localItem.id, localItem);
            newConflicts.push(result.conflict);
            await idbSaveConflict(result.conflict);
          }
        } else {
          mergedMap.set(localItem.id, result.mergedItem ?? serverItem);
        }
      }

      for (const serverItem of serverMap.values()) {
        const itemMutations = pendingByItem.get(serverItem.id) ?? [];
        if (itemMutations.some((mutation) => mutation.operation === "delete")) continue;
        mergedMap.set(serverItem.id, serverItem);
      }

      const mergedItems = Array.from(mergedMap.values());
      await idbReplaceItems(mergedItems);
      await refreshLocalSyncState();
      if (newConflicts.length > 0) {
        setConflicts((previous) => mergeByKey(previous, newConflicts, (conflict) => conflict.itemId));
      }
      setSyncStatus("synced");
      setLastSyncedAt(new Date().toISOString());
      setErrorMessage(undefined);
      return mergedItems;
    } catch (error) {
      setSyncStatus(navigator.onLine ? "error" : "offline");
      setErrorMessage(error instanceof Error ? error.message : "동기화에 실패했습니다.");
      return currentLocalItems;
    }
  }, [refreshLocalSyncState]);

  const flushQueue = useCallback(async (currentItems: WorkspaceItem[]): Promise<FlushResult> => {
    if (!navigator.onLine || provider !== "supabase") {
      setSyncStatus(provider === "guest" ? "guest" : "offline");
      await refreshLocalSyncState();
      return EMPTY_FLUSH_RESULT;
    }

    setSyncStatus("syncing");
    const result = await flushMutationQueue(currentItems);
    await refreshLocalSyncState();
    if (result.rejectedCount > 0 && result.appliedCount === 0) {
      setSyncStatus("error");
      setErrorMessage("일부 변경사항 전송이 거부되었습니다.");
    } else if (result.conflictCount > 0) {
      setSyncStatus("error");
      setErrorMessage("다른 기기와 충돌한 변경사항을 확인해 주세요.");
    } else {
      setSyncStatus("synced");
      setLastSyncedAt(new Date().toISOString());
      setErrorMessage(undefined);
    }
    return result;
  }, [provider, refreshLocalSyncState]);

  const recordMutation = useCallback(async (
    itemId: string,
    operation: MutationOperation,
    baseVersion?: number,
    payload?: Partial<WorkspaceItem>,
    currentItems: WorkspaceItem[] = []
  ) => {
    await queueMutation(itemId, operation, baseVersion, payload);
    await refreshLocalSyncState();
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => void flushQueue(currentItems), 800);
  }, [flushQueue, refreshLocalSyncState]);

  const fetchUserData = useCallback(async (localState?: UserCloudState): Promise<UserCloudState | null> => {
    const idbItems = await idbGetItems();
    const localItems = (localState?.items || []).map(toWorkspaceItem);
    const baseItems = mergeLocalSnapshots(localItems, idbItems);
    const mergedItems = await pullChanges(baseItems);

    let cloudSettings: UserCloudState | null = null;
    try {
      const response = await fetch("/api/user/sync");
      if (response.ok) {
        const data = (await response.json()) as { state?: UserCloudState | null };
        cloudSettings = data.state ?? null;
      }
    } catch {
      // 설정 동기화 실패는 업무 병합을 막지 않습니다.
    }

    return {
      items: mergedItems,
      widgets: mergeByKey(cloudSettings?.widgets || [], localState?.widgets || [], (widget) => widget.id),
      rules: mergeByKey(
        cloudSettings?.rules || [],
        localState?.rules || [],
        (rule) => rule.id ?? `${rule.field}:${rule.action}:${rule.value}`
      ),
      dismissedIds: Array.from(new Set([
        ...(cloudSettings?.dismissedIds || []),
        ...(localState?.dismissedIds || []),
      ])),
    };
  }, [pullChanges]);

  const scheduleSettingsSave = useCallback((state: UserCloudState) => {
    latestSettingsRef.current = state;
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(() => {
      const latest = latestSettingsRef.current;
      if (!latest) return;
      void fetch("/api/user/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: latest }),
      });
    }, 1000);
  }, []);

  const syncUserData = useCallback(async (data: UserCloudState | WorkspaceItem[]) => {
    const state: UserCloudState = Array.isArray(data)
      ? { items: data, widgets: [], rules: [], dismissedIds: [] }
      : data;
    const nextItems = state.items.map(toWorkspaceItem);
    const previousItems = await idbGetItems();
    const previousMap = new Map(previousItems.map((item) => [item.id, item]));
    const nextMap = new Map(nextItems.map((item) => [item.id, item]));
    const pending = await idbGetMutations();
    const pendingIds = new Set(pending.map((mutation) => mutation.itemId));

    for (const item of nextItems) {
      const previous = previousMap.get(item.id);
      if (!previous) {
        if (!pendingIds.has(item.id)) await queueMutation(item.id, "create", undefined, item);
      } else if (hasItemChanged(previous, item)) {
        await queueMutation(item.id, "update", previous.version || 1, item);
      }
    }
    for (const previous of previousItems) {
      if (!nextMap.has(previous.id)) {
        await queueMutation(previous.id, "delete", previous.version || 1);
      }
    }

    await idbReplaceItems(nextItems);
    await refreshLocalSyncState();
    scheduleSettingsSave(state);
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => void flushQueue(nextItems), 800);
  }, [flushQueue, refreshLocalSyncState, scheduleSettingsSave]);

  const mergeOnSignIn = useCallback(async (guestItems: WorkspaceItem[]) => {
    const state = await fetchUserData({ items: guestItems, widgets: [], rules: [], dismissedIds: [] });
    if (state) void flushQueue(state.items.map(toWorkspaceItem));
    return (state?.items || guestItems).map(toWorkspaceItem);
  }, [fetchUserData, flushQueue]);

  const retrySync = useCallback(async (items: WorkspaceItem[] = []) => {
    const local = items.length > 0 ? items : await idbGetItems();
    await flushQueue(local);
    return pullChanges(local);
  }, [flushQueue, pullChanges]);

  const resolveConflict = useCallback(async (
    choice: "keep_local" | "keep_server" | "keep_both",
    conflict: SyncConflict
  ): Promise<WorkspaceItem[]> => {
    await resolveConflictInQueue(conflict.itemId);
    let items = await idbGetItems();
    const map = new Map(items.map((item) => [item.id, item]));

    if (choice === "keep_server") {
      if (conflict.serverItem.deletedAt) map.delete(conflict.itemId);
      else map.set(conflict.itemId, conflict.serverItem);
    } else if (choice === "keep_local") {
      const local = { ...conflict.localItem, version: conflict.serverItem.version };
      map.set(local.id, local);
      await queueMutation(local.id, "update", conflict.serverItem.version, local);
    } else {
      if (!conflict.serverItem.deletedAt) map.set(conflict.itemId, conflict.serverItem);
      else map.delete(conflict.itemId);
      const copy: WorkspaceItem = {
        ...conflict.localItem,
        id: `${conflict.localItem.id}-copy-${Date.now()}`,
        title: `${conflict.localItem.title} (이 기기 사본)`,
        version: 1,
        created_at: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: undefined,
      };
      map.set(copy.id, copy);
      await queueMutation(copy.id, "create", undefined, copy);
    }

    items = Array.from(map.values());
    await idbReplaceItems(items);
    await refreshLocalSyncState();
    void flushQueue(items);
    return items;
  }, [flushQueue, refreshLocalSyncState]);

  const dismissConflict = useCallback((itemId: string) => {
    setConflicts((previous) => previous.filter((conflict) => conflict.itemId !== itemId));
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus("syncing");
      void idbGetItems().then((items) => flushQueue(items));
    };
    const handleOffline = () => setSyncStatus("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void Promise.all([idbGetMutations(), idbGetConflicts()]).then(([mutations, storedConflicts]) => {
      setPendingCount(mutations.length);
      setConflicts(storedConflicts.filter((conflict) => !conflict.resolved));
    });
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    };
  }, [flushQueue]);

  return {
    syncStatus,
    provider,
    lastSyncedAt,
    pendingCount,
    errorMessage,
    conflicts,
    pullChanges,
    flushQueue,
    recordMutation,
    mergeOnSignIn,
    refreshLocalSyncState,
    fetchUserData,
    syncUserData,
    retrySync,
    resolveConflict,
    dismissConflict,
  };
}
