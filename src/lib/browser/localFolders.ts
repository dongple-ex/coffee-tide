// 브라우저 로컬 폴더 연동 — File System Access API (Chromium 전용).
// 원격 배포(coffeeTide.dongple.kr)에서는 서버가 사용자 PC가 아니므로,
// 서버 어댑터(obsidian/localDoc/llmArtifact)의 스캔 규칙을 브라우저에서 미러링한다.
// 폴더 핸들은 IndexedDB에 영속 — 재방문 시 queryPermission으로 권한을 확인하고,
// 만료됐으면 사용자 제스처에서 requestPermission으로 복구한다.

import { UnifiedData } from "@/lib/types/unified";

export type BrowserFolderKind = "obsidian" | "local_doc" | "llm";

export interface BrowserFolderInfo {
  key: string;
  kind: BrowserFolderKind;
  name: string;
  permission: "granted" | "prompt";
}

export interface BrowserScanResult {
  items: UnifiedData[];
  /** 모든 폴더가 권한 허용 상태로 스캔됐는지 — dismiss 정리(D3)는 완전 스캔일 때만 */
  complete: boolean;
  folders: BrowserFolderInfo[];
}

/** 브라우저 항목 id 접두사 — 서버 항목과 구분해 write-back/dismiss 정리 경로를 분기 */
export const BROWSER_ID_PREFIX = "bfs-";

const DB_NAME = "coffeeTide-fs";
const STORE = "folders";
const CAPTURE_NOTE = "coffeeTide_수집함.md";
const MAX_LOCAL_DOC_FOLDERS = 5;

// fsScan.ts와 동일한 스캔 상수 (서버 규칙 미러)
const EXCLUDED_DIRS = new Set([".git", ".obsidian", ".trash", "node_modules", ".next"]);
const MAX_FILE_BYTES = 512 * 1024;

// ── FSA 타입 캐스트 (lib.dom에 없는 WICG 확장은 unknown 캐스트로 접근) ──
type PermMode = "read" | "readwrite";

interface PermHandle {
  queryPermission?: (desc: { mode: PermMode }) => Promise<PermissionState>;
  requestPermission?: (desc: { mode: PermMode }) => Promise<PermissionState>;
}

interface IterableDirHandle {
  values: () => AsyncIterableIterator<FileSystemHandle>;
}

interface WritableFileHandle {
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

interface FolderRecord {
  key: string;
  kind: BrowserFolderKind;
  name: string;
  handle: FileSystemDirectoryHandle;
}

export function supportsFsAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Obsidian은 완료 write-back·캡처를 위해 쓰기 권한, 나머지는 읽기 전용 */
function modeFor(kind: BrowserFolderKind): PermMode {
  return kind === "obsidian" ? "readwrite" : "read";
}

// ── IndexedDB 핸들 저장소 ─────────────────────
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function allRecords(): Promise<FolderRecord[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as FolderRecord[]);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function putRecord(record: FolderRecord): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function removeBrowserFolder(key: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// ── 권한 ─────────────────────────────────────
async function permissionOf(
  handle: FileSystemDirectoryHandle,
  mode: PermMode
): Promise<PermissionState> {
  const h = handle as unknown as PermHandle;
  if (!h.queryPermission) return "granted";
  try {
    return await h.queryPermission({ mode });
  } catch {
    return "prompt";
  }
}

async function ensureWritePermission(handle: FileSystemDirectoryHandle): Promise<void> {
  const h = handle as unknown as PermHandle;
  if (!h.queryPermission || !h.requestPermission) return;
  if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return;
  if ((await h.requestPermission({ mode: "readwrite" })) !== "granted") {
    throw new Error("폴더 쓰기 권한이 허용되지 않았습니다");
  }
}

/** 만료된 권한을 사용자 제스처 안에서 일괄 재요청 (브라우저가 일부만 허용해도 부분 성공) */
export async function requestBrowserPermissions(): Promise<void> {
  const records = await allRecords();
  for (const r of records) {
    const h = r.handle as unknown as PermHandle;
    if (!h.queryPermission || !h.requestPermission) continue;
    const mode = modeFor(r.kind);
    try {
      if ((await h.queryPermission({ mode })) !== "granted") {
        await h.requestPermission({ mode });
      }
    } catch {
      // 개별 실패는 무시 — 배너가 남아 있으면 다시 누를 수 있음
    }
  }
}

// ── 연결/해제 ─────────────────────────────────
export async function pickBrowserFolder(kind: BrowserFolderKind): Promise<string | null> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (opts: {
        id: string;
        mode: PermMode;
      }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (!picker) throw new Error("이 브라우저는 폴더 열기를 지원하지 않습니다 (Chrome/Edge 필요)");

  if (kind === "local_doc") {
    const count = (await allRecords()).filter((r) => r.kind === "local_doc").length;
    if (count >= MAX_LOCAL_DOC_FOLDERS) {
      throw new Error(`폴더는 ${MAX_LOCAL_DOC_FOLDERS}개까지 함께 살펴봐 드려요`);
    }
  }

  let handle: FileSystemDirectoryHandle;
  try {
    handle = await picker.call(window, { id: `coffeetide-${kind}`, mode: modeFor(kind) });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null; // 사용자가 취소
    throw err;
  }

  const key = kind === "local_doc" ? `local_doc:${handle.name}` : kind;
  await putRecord({ key, kind, name: handle.name, handle });
  return handle.name;
}

// ── 스캔 (서버 어댑터 규칙 미러) ───────────────
interface ScannedFile {
  relPath: string;
  file: File;
}

async function walk(
  dir: FileSystemDirectoryHandle,
  extensions: string[],
  maxFiles: number
): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];

  async function rec(d: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    if (results.length >= maxFiles) return;
    try {
      for await (const entry of (d as unknown as IterableDirHandle).values()) {
        if (results.length >= maxFiles) return;
        if (entry.kind === "directory") {
          if (!EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
            await rec(entry as FileSystemDirectoryHandle, `${prefix}${entry.name}/`);
          }
        } else {
          const dot = entry.name.lastIndexOf(".");
          const ext = dot >= 0 ? entry.name.slice(dot).toLowerCase() : "";
          if (!extensions.includes(ext)) continue;
          try {
            const file = await (entry as FileSystemFileHandle).getFile();
            if (file.size <= MAX_FILE_BYTES) {
              results.push({ relPath: `${prefix}${entry.name}`, file });
            }
          } catch {
            // 개별 파일 실패는 무시
          }
        }
      }
    } catch {
      // 접근 불가 폴더는 건너뜀 (부분 실패 허용)
    }
  }

  await rec(dir, "");
  results.sort((a, b) => b.file.lastModified - a.file.lastModified);
  return results;
}

function toB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function excerpt(text: string, max = 500): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max) + "…";
}

/** fsScan.parseFrontmatter와 동일 — 서버 모듈은 node:fs를 import해서 클라이언트에서 재사용 불가 */
function parseFrontmatter(text: string): { fields: Record<string, string>; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.+)\s*$/);
    if (kv) fields[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { fields, body: text.slice(match[0].length) };
}

async function scanObsidian(handle: FileSystemDirectoryHandle): Promise<UnifiedData[]> {
  const files = await walk(handle, [".md"], 100);
  const items: UnifiedData[] = [];
  for (const f of files) {
    if (items.length >= 10) break;
    let text: string;
    try {
      text = await f.file.text();
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && items.length < 10; i++) {
      const match = lines[i].match(/^\s*[-*]\s*\[ \]\s*(.+)$/);
      if (!match) continue;
      items.push({
        id: `${BROWSER_ID_PREFIX}obs-${toB64Url(`${f.relPath}|${i}`)}`,
        source: "obsidian",
        title: match[1].trim(),
        content: `노트 '${f.relPath.replace(/\.md$/, "")}'의 미완료 항목`,
        created_at: new Date(f.file.lastModified).toISOString(),
        author: { name: "Obsidian Vault" },
        url: `obsidian://open?file=${encodeURIComponent(f.relPath.replace(/\.md$/, ""))}`,
        status: "pending",
      });
    }
  }
  return items;
}

async function scanLocalDoc(
  handle: FileSystemDirectoryHandle,
  folderName: string
): Promise<UnifiedData[]> {
  const files = await walk(handle, [".md", ".txt"], 100);
  const items: UnifiedData[] = [];
  for (const f of files) {
    if (items.length >= 10) break;
    let text: string;
    try {
      text = await f.file.text();
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && items.length < 10; i++) {
      const todo =
        lines[i].match(/^\s*[-*]\s*\[ \]\s*(.+)$/) || lines[i].match(/^\s*TODO[:：]\s*(.+)$/i);
      if (!todo) continue;
      items.push({
        id: `${BROWSER_ID_PREFIX}doc-${toB64Url(`${folderName}|${f.relPath}|${i}`)}`,
        source: "local_doc",
        title: todo[1].trim(),
        content: `문서 '${folderName}/${f.relPath}'에서 추출된 할 일`,
        created_at: new Date(f.file.lastModified).toISOString(),
        author: { name: "로컬 문서" },
        url: "", // FSA는 실제 경로를 노출하지 않음
        status: "pending",
      });
    }
  }
  return items;
}

function inferAuthor(relPath: string, fields: Record<string, string>): string {
  const p = relPath.toLowerCase();
  if (p.includes("claude")) return "Claude";
  if (p.includes("gemini")) return "Gemini";
  if (fields.author) return fields.author;
  return "LLM";
}

async function scanLlm(handle: FileSystemDirectoryHandle): Promise<UnifiedData[]> {
  const files = await walk(handle, [".md", ".txt"], 200);
  const items: UnifiedData[] = [];
  for (const f of files) {
    if (items.length >= 20) break;
    let text: string;
    try {
      text = await f.file.text();
    } catch {
      continue;
    }
    const { fields, body } = parseFrontmatter(text);
    const heading = body.match(/^#\s+(.+)$/m)?.[1];
    const fileName = f.relPath.replace(/\.(md|txt)$/i, "");
    items.push({
      id: `${BROWSER_ID_PREFIX}llm-${toB64Url(f.relPath)}`,
      source: "llm",
      title: fields.name || heading || fileName,
      content: [fields.description, excerpt(body, 500)].filter(Boolean).join(" — "),
      created_at: new Date(f.file.lastModified).toISOString(),
      author: { name: inferAuthor(f.relPath, fields) },
      url: "",
      category: "reference",
      status: "pending",
    });
  }
  return items;
}

/** 저장된 모든 브라우저 폴더를 스캔 — 권한 없는 폴더는 건너뛰고 folders에 상태 보고 */
export async function scanBrowserFolders(): Promise<BrowserScanResult> {
  const records = await allRecords();
  const items: UnifiedData[] = [];
  const folders: BrowserFolderInfo[] = [];
  let complete = true;

  for (const r of records) {
    const perm = await permissionOf(r.handle, modeFor(r.kind));
    folders.push({
      key: r.key,
      kind: r.kind,
      name: r.name,
      permission: perm === "granted" ? "granted" : "prompt",
    });
    if (perm !== "granted") {
      complete = false;
      continue;
    }
    try {
      if (r.kind === "obsidian") items.push(...(await scanObsidian(r.handle)));
      else if (r.kind === "local_doc") items.push(...(await scanLocalDoc(r.handle, r.name)));
      else items.push(...(await scanLlm(r.handle)));
    } catch {
      complete = false; // 폴더 하나 실패해도 나머지는 계속 (부분 실패 허용)
    }
  }
  return { items, complete, folders };
}

// ── Obsidian write-back (ObsidianAdapter 미러) ──
async function resolveFile(
  root: FileSystemDirectoryHandle,
  relPath: string
): Promise<FileSystemFileHandle> {
  const segments = relPath.split("/");
  let dir = root;
  for (const seg of segments.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(seg);
  }
  return dir.getFileHandle(segments[segments.length - 1]);
}

async function obsidianVault(): Promise<FolderRecord> {
  const vault = (await allRecords()).find((r) => r.kind === "obsidian");
  if (!vault) throw new Error("브라우저 Obsidian 연동을 찾을 수 없습니다");
  return vault;
}

/** 완료 write-back — id에 인코딩된 파일/줄의 체크박스를 [x]로 갱신 */
export async function completeBrowserObsidianTask(id: string): Promise<void> {
  const decoded = fromB64Url(id.replace(`${BROWSER_ID_PREFIX}obs-`, ""));
  const sep = decoded.lastIndexOf("|");
  const relPath = decoded.slice(0, sep);
  const lineNo = Number(decoded.slice(sep + 1));

  const vault = await obsidianVault();
  await ensureWritePermission(vault.handle);
  const fileHandle = await resolveFile(vault.handle, relPath);
  const text = await (await fileHandle.getFile()).text();
  const lines = text.split(/\r?\n/);
  if (!lines[lineNo] || !/\[ \]/.test(lines[lineNo])) {
    throw new Error("대상 체크박스를 찾을 수 없습니다 (노트가 수정되었을 수 있음)");
  }
  lines[lineNo] = lines[lineNo].replace("[ ]", "[x]");
  const writable = await (fileHandle as unknown as WritableFileHandle).createWritable();
  await writable.write(lines.join("\n"));
  await writable.close();
}

/** 빠른 캡처 — 수집함 노트에 체크박스 항목 append */
export async function captureBrowserObsidian(title: string, content?: string): Promise<string> {
  const vault = await obsidianVault();
  await ensureWritePermission(vault.handle);
  const fileHandle = await vault.handle.getFileHandle(CAPTURE_NOTE, { create: true });
  let existing = await (await fileHandle.getFile()).text();
  if (!existing.trim()) existing = "# coffeeTide 수집함\n";
  const line = `- [ ] ${title}${content ? ` — ${excerpt(content, 120)}` : ""}`;
  const writable = await (fileHandle as unknown as WritableFileHandle).createWritable();
  await writable.write(`${existing.trimEnd()}\n${line}\n`);
  await writable.close();
  return CAPTURE_NOTE;
}
