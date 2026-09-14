"use client";

import type {
  KnowledgeArchiveChunk,
  KnowledgeArchiveDocument,
} from "./archive";

const DB_NAME_PREFIX = "coffeeTide_knowledge_archive";
const DB_VERSION = 1;
const DOCUMENT_STORE = "documents";
const CHUNK_STORE = "chunks";

function normalizedOwnerScope(ownerScope: string): string {
  const normalized = ownerScope.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return normalized || "guest";
}

export function archiveDbName(ownerScope: string): string {
  return `${DB_NAME_PREFIX}_${normalizedOwnerScope(ownerScope)}`;
}

function openArchiveDb(ownerScope: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB를 사용할 수 없습니다."));
      return;
    }
    const request = window.indexedDB.open(archiveDbName(ownerScope), DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) {
        db.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const store = db.createObjectStore(CHUNK_STORE, { keyPath: "id" });
        store.createIndex("archiveId", "archiveId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveArchiveToIndexedDb(
  ownerScope: string,
  document: KnowledgeArchiveDocument,
  chunks: KnowledgeArchiveChunk[]
): Promise<void> {
  const db = await openArchiveDb(ownerScope);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([DOCUMENT_STORE, CHUNK_STORE], "readwrite");
      tx.objectStore(DOCUMENT_STORE).put(document);
      const chunkStore = tx.objectStore(CHUNK_STORE);
      const index = chunkStore.index("archiveId");
      const cursorRequest = index.openKeyCursor(IDBKeyRange.only(document.id));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          chunkStore.delete(cursor.primaryKey);
          cursor.continue();
          return;
        }
        for (const chunk of chunks) chunkStore.put(chunk);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadArchiveFromIndexedDb(ownerScope: string): Promise<{
  documents: KnowledgeArchiveDocument[];
  chunks: KnowledgeArchiveChunk[];
}> {
  try {
    const db = await openArchiveDb(ownerScope);
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction([DOCUMENT_STORE, CHUNK_STORE], "readonly");
        const documentsRequest = tx.objectStore(DOCUMENT_STORE).getAll();
        const chunksRequest = tx.objectStore(CHUNK_STORE).getAll();
        tx.oncomplete = () =>
          resolve({
            documents: (documentsRequest.result ?? []) as KnowledgeArchiveDocument[],
            chunks: (chunksRequest.result ?? []) as KnowledgeArchiveChunk[],
          });
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return { documents: [], chunks: [] };
  }
}

export async function getArchiveDocument(
  ownerScope: string,
  id: string
): Promise<KnowledgeArchiveDocument | null> {
  const { documents } = await loadArchiveFromIndexedDb(ownerScope);
  return documents.find((document) => document.id === id) ?? null;
}
