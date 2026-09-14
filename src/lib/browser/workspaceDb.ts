import type { WorkspaceItem } from "../data/contracts";
import type { SyncConflict, SyncMutation } from "../sync/contracts";

const DB_NAME_PREFIX = "coffeeTide_workspace_db";
const DB_VERSION = 1;
const WORKSPACE_STORES = ["items", "mutations", "conflicts", "sync_meta", "local_assets"] as const;
const TRANSFER_STORES = ["items", "mutations", "conflicts", "local_assets"] as const;

const dbPromises = new Map<string, Promise<IDBDatabase>>();
const legacyClaimPromises = new Map<string, Promise<void>>();

export function workspaceDbName(ownerScope: string): string {
  const normalized = ownerScope.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return !normalized || normalized === "guest"
    ? DB_NAME_PREFIX
    : `${DB_NAME_PREFIX}_${normalized}`;
}

function openIndexedDb(dbName: string): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }

  const existingPromise = dbPromises.get(dbName);
  if (existingPromise) return existingPromise;

  const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains("items")) {
        db.createObjectStore("items", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("mutations")) {
        db.createObjectStore("mutations", { keyPath: "mutationId" });
      }
      if (!db.objectStoreNames.contains("conflicts")) {
        db.createObjectStore("conflicts", { keyPath: "itemId" });
      }
      if (!db.objectStoreNames.contains("sync_meta")) {
        db.createObjectStore("sync_meta", { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains("local_assets")) {
        db.createObjectStore("local_assets", { keyPath: "assetId" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      dbPromises.delete(dbName);
      reject(request.error);
    };
  });

  dbPromises.set(dbName, dbPromise);
  return dbPromise;
}

async function readAllStores(db: IDBDatabase): Promise<Record<string, unknown[]>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...WORKSPACE_STORES], "readonly");
    const records: Record<string, unknown[]> = {};
    for (const storeName of WORKSPACE_STORES) {
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => {
        records[storeName] = request.result ?? [];
      };
    }
    tx.oncomplete = () => resolve(records);
    tx.onerror = () => reject(tx.error ?? new Error("기존 로컬 작업을 읽지 못했습니다."));
    tx.onabort = () => reject(tx.error ?? new Error("기존 로컬 작업 읽기가 중단되었습니다."));
  });
}

async function claimLegacyWorkspace(targetDbName: string): Promise<void> {
  const sourceDb = await openIndexedDb(DB_NAME_PREFIX);
  const targetDb = await openIndexedDb(targetDbName);
  const records = await readAllStores(sourceDb);
  const hasTransferData = TRANSFER_STORES.some((storeName) => records[storeName]?.length > 0);
  const hasSourceData = hasTransferData || (records.sync_meta?.length ?? 0) > 0;
  if (!hasSourceData) return;

  if (hasTransferData) {
    await new Promise<void>((resolve, reject) => {
      const tx = targetDb.transaction([...TRANSFER_STORES], "readwrite");
      for (const storeName of TRANSFER_STORES) {
        const store = tx.objectStore(storeName);
        for (const record of records[storeName] ?? []) store.put(record);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("기존 로컬 작업을 계정 저장소로 옮기지 못했습니다."));
      tx.onabort = () => reject(tx.error ?? new Error("기존 로컬 작업 이전이 중단되었습니다."));
    });
  }

  await new Promise<void>((resolve, reject) => {
    const tx = sourceDb.transaction([...WORKSPACE_STORES], "readwrite");
    for (const storeName of WORKSPACE_STORES) tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("이전한 로컬 작업을 정리하지 못했습니다."));
    tx.onabort = () => reject(tx.error ?? new Error("이전한 로컬 작업 정리가 중단되었습니다."));
  });
}

/**
 * 게스트는 기존 전역 DB 이름을 계속 사용합니다. 로그인 계정이 처음 접근할 때 전역 DB에 남아 있던
 * 업무, 대기 mutation, 충돌 및 로컬 파일을 계정 DB로 승계한 뒤 전역 DB를 비웁니다.
 */
export async function getIndexedDb(ownerScope: string): Promise<IDBDatabase> {
  const dbName = workspaceDbName(ownerScope);
  if (dbName === DB_NAME_PREFIX) return openIndexedDb(dbName);

  let claimPromise = legacyClaimPromises.get(dbName);
  if (!claimPromise) {
    claimPromise = claimLegacyWorkspace(dbName).catch((error) => {
      legacyClaimPromises.delete(dbName);
      throw error;
    });
    legacyClaimPromises.set(dbName, claimPromise);
  }
  await claimPromise;
  return openIndexedDb(dbName);
}

export async function idbGetItems(ownerScope: string): Promise<WorkspaceItem[]> {
  try {
    const db = await getIndexedDb(ownerScope);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("items", "readonly");
      const store = tx.objectStore("items");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function idbSaveItems(ownerScope: string, items: WorkspaceItem[]): Promise<void> {
  try {
    const db = await getIndexedDb(ownerScope);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("items", "readwrite");
      const store = tx.objectStore("items");
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB 불가 환경 조용히 처리
  }
}

/**
 * 전달된 목록을 IndexedDB의 현재 업무 스냅샷으로 교체합니다.
 * 서버 tombstone이나 로컬 삭제가 재실행 후 부활하지 않도록 기존 키를 먼저 비웁니다.
 */
export async function idbReplaceItems(ownerScope: string, items: WorkspaceItem[]): Promise<void> {
  try {
    const db = await getIndexedDb(ownerScope);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("items", "readwrite");
      const store = tx.objectStore("items");
      store.clear();
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB 불가 환경에서는 localStorage 정본을 유지합니다.
  }
}

export async function idbDeleteItems(ownerScope: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  try {
    const db = await getIndexedDb(ownerScope);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("items", "readwrite");
      const store = tx.objectStore("items");
      for (const id of itemIds) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB 불가 환경에서는 localStorage 정본을 유지합니다.
  }
}

export async function idbGetMutations(ownerScope: string): Promise<SyncMutation[]> {
  try {
    const db = await getIndexedDb(ownerScope);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("mutations", "readonly");
      const store = tx.objectStore("mutations");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function idbSaveMutation(ownerScope: string, mutation: SyncMutation): Promise<void> {
  try {
    const db = await getIndexedDb(ownerScope);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("mutations", "readwrite");
      const store = tx.objectStore("mutations");
      store.put(mutation);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function idbRemoveMutations(ownerScope: string, mutationIds: string[]): Promise<void> {
  try {
    const db = await getIndexedDb(ownerScope);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("mutations", "readwrite");
      const store = tx.objectStore("mutations");
      for (const id of mutationIds) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function idbGetConflicts(ownerScope: string): Promise<SyncConflict[]> {
  try {
    const db = await getIndexedDb(ownerScope);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("conflicts", "readonly");
      const store = tx.objectStore("conflicts");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function idbSaveConflict(ownerScope: string, conflict: SyncConflict): Promise<void> {
  try {
    const db = await getIndexedDb(ownerScope);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("conflicts", "readwrite");
      const store = tx.objectStore("conflicts");
      store.put(conflict);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function idbRemoveConflict(ownerScope: string, itemId: string): Promise<void> {
  try {
    const db = await getIndexedDb(ownerScope);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("conflicts", "readwrite");
      const store = tx.objectStore("conflicts");
      store.delete(itemId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function idbGetMeta(ownerScope: string, name: string): Promise<string | null> {
  try {
    const db = await getIndexedDb(ownerScope);
    return new Promise((resolve) => {
      const tx = db.transaction("sync_meta", "readonly");
      const store = tx.objectStore("sync_meta");
      const req = store.get(name);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function idbSetMeta(ownerScope: string, name: string, value: string): Promise<void> {
  try {
    const db = await getIndexedDb(ownerScope);
    return new Promise((resolve) => {
      const tx = db.transaction("sync_meta", "readwrite");
      const store = tx.objectStore("sync_meta");
      store.put({ name, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

/**
 * 충돌 선택 결과, 새 mutation, 기존 충돌 제거를 하나의 IndexedDB 트랜잭션으로 확정합니다.
 * 이 함수는 실패를 숨기지 않아 UI가 성공으로 오인하지 않도록 합니다.
 */
export async function idbCommitConflictResolution(
  ownerScope: string,
  itemId: string,
  items: WorkspaceItem[],
  mutation?: SyncMutation
): Promise<void> {
  const db = await getIndexedDb(ownerScope);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["items", "mutations", "conflicts"], "readwrite");
    const itemStore = tx.objectStore("items");
    const mutationStore = tx.objectStore("mutations");

    itemStore.clear();
    for (const item of items) itemStore.put(item);
    tx.objectStore("conflicts").delete(itemId);

    const cursorRequest = mutationStore.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        const queued = cursor.value as SyncMutation;
        if (queued.itemId === itemId) cursor.delete();
        cursor.continue();
        return;
      }
      if (mutation) mutationStore.put(mutation);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("충돌 해결 내용을 저장하지 못했습니다."));
    tx.onabort = () => reject(tx.error ?? new Error("충돌 해결 저장이 중단되었습니다."));
  });
}
