import type { WorkspaceItem } from "../data/contracts";
import type { SyncConflict, SyncMutation } from "../sync/contracts";

const DB_NAME = "coffeeTide_workspace_db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function getIndexedDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

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
      reject(request.error);
    };
  });

  return dbPromise;
}

export async function idbGetItems(): Promise<WorkspaceItem[]> {
  try {
    const db = await getIndexedDb();
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

export async function idbSaveItems(items: WorkspaceItem[]): Promise<void> {
  try {
    const db = await getIndexedDb();
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
export async function idbReplaceItems(items: WorkspaceItem[]): Promise<void> {
  try {
    const db = await getIndexedDb();
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

export async function idbDeleteItems(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  try {
    const db = await getIndexedDb();
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

export async function idbGetMutations(): Promise<SyncMutation[]> {
  try {
    const db = await getIndexedDb();
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

export async function idbSaveMutation(mutation: SyncMutation): Promise<void> {
  try {
    const db = await getIndexedDb();
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

export async function idbRemoveMutations(mutationIds: string[]): Promise<void> {
  try {
    const db = await getIndexedDb();
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

export async function idbGetConflicts(): Promise<SyncConflict[]> {
  try {
    const db = await getIndexedDb();
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

export async function idbSaveConflict(conflict: SyncConflict): Promise<void> {
  try {
    const db = await getIndexedDb();
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

export async function idbRemoveConflict(itemId: string): Promise<void> {
  try {
    const db = await getIndexedDb();
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

export async function idbGetMeta(name: string): Promise<string | null> {
  try {
    const db = await getIndexedDb();
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

export async function idbSetMeta(name: string, value: string): Promise<void> {
  try {
    const db = await getIndexedDb();
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
