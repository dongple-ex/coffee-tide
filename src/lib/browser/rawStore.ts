// IndexedDB 기반 대용량 회의록/메모 원문 보관소
// localStorage 5MB 제한을 우회하여 수백 MB~GB 용량으로 원문을 안전하게 영구 저장합니다.

const RAW_DB_NAME = "coffeeTide_raw_db";
const RAW_STORE_NAME = "raw_contents";

function openRawDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not supported"));
    }
    const req = window.indexedDB.open(RAW_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(RAW_STORE_NAME)) {
        req.result.createObjectStore(RAW_STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRawContent(id: string, text: string): Promise<void> {
  try {
    const db = await openRawDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(RAW_STORE_NAME, "readwrite");
      tx.objectStore(RAW_STORE_NAME).put({ id, text, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("[rawStore] Failed to save raw content in IndexedDB:", err);
  }
}

export async function getRawContent(id: string): Promise<string | null> {
  try {
    const db = await openRawDb();
    const result = await new Promise<{ id: string; text: string } | undefined>((resolve, reject) => {
      const tx = db.transaction(RAW_STORE_NAME, "readonly");
      const req = tx.objectStore(RAW_STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result?.text ?? null;
  } catch {
    return null;
  }
}
