// 🗄️ CoffeeTide 게스트/오프라인 IndexedDB 로컬 저장소 (Phase 17-A)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §10.1, §11.1

import {
  CompanionEvent,
  CompanionProfile,
  CompanionMemory,
  CompanionDeletionTombstone,
} from "../contracts";

const DB_NAME = "coffeetide_companion_local_v1";
const DB_VERSION = 1;

interface MemoryFallbackStore {
  profiles: Map<string, CompanionProfile>;
  events: CompanionEvent[];
  memories: Map<string, CompanionMemory>;
  tombstones: CompanionDeletionTombstone[];
}

const memoryFallback: MemoryFallbackStore = {
  profiles: new Map(),
  events: [],
  memories: new Map(),
  tombstones: [],
};

function getIndexedDb(): IDBFactory | null {
  if (typeof window !== "undefined" && window.indexedDB) {
    return window.indexedDB;
  }
  return null;
}

function openCompanionDb(): Promise<IDBDatabase> {
  const idb = getIndexedDb();
  if (!idb) {
    return Promise.reject(new Error("IndexedDB not available"));
  }

  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains("profiles")) {
        db.createObjectStore("profiles", { keyPath: "personaId" });
      }
      if (!db.objectStoreNames.contains("events")) {
        const eventStore = db.createObjectStore("events", { keyPath: "id" });
        eventStore.createIndex("by_persona", "personaId", { unique: false });
        eventStore.createIndex("by_idempotency", "idempotencyKey", { unique: true });
        eventStore.createIndex("by_credited_day", "creditedDay", { unique: false });
      }
      if (!db.objectStoreNames.contains("memories")) {
        const memoryStore = db.createObjectStore("memories", { keyPath: "id" });
        memoryStore.createIndex("by_status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains("tombstones")) {
        db.createObjectStore("tombstones", { keyPath: "resourceKeyHash" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 게스트 프로필 저장/조회 */
export async function getLocalCompanionProfile(personaId = "karina"): Promise<CompanionProfile> {
  try {
    const db = await openCompanionDb();
    return new Promise((resolve) => {
      const tx = db.transaction("profiles", "readonly");
      const store = tx.objectStore("profiles");
      const req = store.get(personaId);
      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result);
        } else {
          resolve(getDefaultProfile(personaId));
        }
      };
      req.onerror = () => resolve(getDefaultProfile(personaId));
    });
  } catch {
    return memoryFallback.profiles.get(personaId) || getDefaultProfile(personaId);
  }
}

export async function saveLocalCompanionProfile(profile: CompanionProfile): Promise<void> {
  memoryFallback.profiles.set(profile.personaId, profile);
  try {
    const db = await openCompanionDb();
    const tx = db.transaction("profiles", "readwrite");
    tx.objectStore("profiles").put(profile);
  } catch {
    // fallback memory only
  }
}

/** 게스트 로컬 이벤트 저장 (local_provisional) */
export async function saveLocalCompanionEvent(event: CompanionEvent): Promise<boolean> {
  // 멱등성 체크
  const existingIdx = memoryFallback.events.findIndex(
    (e) => e.idempotencyKey === event.idempotencyKey
  );
  if (existingIdx >= 0) return false;

  memoryFallback.events.push(event);

  try {
    const db = await openCompanionDb();
    return new Promise((resolve) => {
      const tx = db.transaction("events", "readwrite");
      const store = tx.objectStore("events");
      const req = store.add(event);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false); // 멱등 키 충돌 등
    });
  } catch {
    return true;
  }
}

export async function getLocalCompanionEvents(personaId?: string): Promise<CompanionEvent[]> {
  try {
    const db = await openCompanionDb();
    return new Promise((resolve) => {
      const tx = db.transaction("events", "readonly");
      const store = tx.objectStore("events");
      const req = personaId
        ? store.index("by_persona").getAll(personaId)
        : store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve(memoryFallback.events);
    });
  } catch {
    if (personaId) {
      return memoryFallback.events.filter((e) => e.personaId === personaId);
    }
    return [...memoryFallback.events];
  }
}

/** 게스트 기억 목록 조회 */
export async function getLocalCompanionMemories(status?: string): Promise<CompanionMemory[]> {
  try {
    const db = await openCompanionDb();
    return new Promise((resolve) => {
      const tx = db.transaction("memories", "readonly");
      const store = tx.objectStore("memories");
      const req = status ? store.index("by_status").getAll(status) : store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve(Array.from(memoryFallback.memories.values()));
    });
  } catch {
    const list = Array.from(memoryFallback.memories.values());
    if (status) {
      return list.filter((m) => m.status === status);
    }
    return list;
  }
}

export async function saveLocalCompanionMemory(memory: CompanionMemory): Promise<void> {
  memoryFallback.memories.set(memory.id, memory);
  try {
    const db = await openCompanionDb();
    const tx = db.transaction("memories", "readwrite");
    tx.objectStore("memories").put(memory);
  } catch {
    // fallback
  }
}

/** 게스트 로컬 기억 삭제 및 tombstone 기록 */
export async function deleteLocalCompanionMemory(
  memoryId: string,
  keyHash: string
): Promise<void> {
  memoryFallback.memories.delete(memoryId);
  const tombstone: CompanionDeletionTombstone = {
    userId: "guest",
    resourceType: "memory",
    resourceKeyHash: keyHash,
    deletionVersion: Date.now(),
    deletedAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
  memoryFallback.tombstones.push(tombstone);

  try {
    const db = await openCompanionDb();
    const tx = db.transaction(["memories", "tombstones"], "readwrite");
    tx.objectStore("memories").delete(memoryId);
    tx.objectStore("tombstones").put(tombstone);
  } catch {
    // fallback
  }
}

function getDefaultProfile(personaId: string): CompanionProfile {
  return {
    userId: "guest",
    personaId,
    bondExp: 0,
    relationshipLevel: 1,
    currentMode: "momentum",
    completedTasksCount: 0,
    lastInteractionAt: Date.now(),
    version: 1,
    updatedAt: Date.now(),
  };
}
