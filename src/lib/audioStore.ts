const DB_NAME = "CoffeeTideAudioStore";
const STORE_NAME = "chunks";
const DB_VERSION = 1;

interface ChunkRecord {
  id: string; // meetingId_chunkIndex
  meetingId: string;
  chunkIndex: number;
  blob: Blob;
  durationSeconds: number;
  transcription?: string;
  status: "pending" | "uploading" | "transcribing" | "completed" | "failed";
}

export function openAudioStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("meetingId", "meetingId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAudioChunk(record: ChunkRecord): Promise<void> {
  const db = await openAudioStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAudioChunks(meetingId: string): Promise<ChunkRecord[]> {
  const db = await openAudioStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("meetingId");
    const req = index.getAll(meetingId);
    req.onsuccess = () => {
      const records = req.result as ChunkRecord[];
      records.sort((a, b) => a.chunkIndex - b.chunkIndex);
      resolve(records);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updateChunkStatus(id: string, status: ChunkRecord["status"], transcription?: string): Promise<void> {
  const db = await openAudioStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result as ChunkRecord;
      if (record) {
        record.status = status;
        if (transcription) record.transcription = transcription;
        store.put(record);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function clearAudioChunks(meetingId: string): Promise<void> {
  const db = await openAudioStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("meetingId");
    const req = index.getAllKeys(meetingId);
    req.onsuccess = () => {
      const keys = req.result;
      keys.forEach((key) => store.delete(key));
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}
