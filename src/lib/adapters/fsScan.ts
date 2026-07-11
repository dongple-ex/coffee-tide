// 로컬 파일 스캔 공용 유틸 — 데스크톱 전용 (서버=사용자 PC 전제, doc/8-mobile_strategy.md §4)

import { promises as fs } from "node:fs";
import path from "node:path";

export const EXCLUDED_DIRS = new Set([
  ".git",
  ".obsidian",
  ".trash",
  "node_modules",
  ".next",
]);

const MAX_FILE_BYTES = 512 * 1024; // 과대 파일 스킵 (phase6 §12)

export interface ScannedFile {
  fullPath: string;
  relPath: string;
  mtime: Date;
}

export async function walkFiles(
  root: string,
  extensions: string[],
  maxFiles = 200
): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxFiles) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // 접근 불가 폴더는 건너뜀 (부분 실패 허용)
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          await walk(full);
        }
      } else if (extensions.includes(path.extname(entry.name).toLowerCase())) {
        try {
          const stat = await fs.stat(full);
          if (stat.size <= MAX_FILE_BYTES) {
            results.push({
              fullPath: full,
              relPath: path.relative(root, full),
              mtime: stat.mtime,
            });
          }
        } catch {
          // 개별 파일 실패는 무시
        }
      }
    }
  }

  await walk(root);
  results.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return results;
}

export async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** YAML frontmatter 경량 파서 — name/description 등 1depth 문자열 키만 추출 */
export function parseFrontmatter(text: string): {
  fields: Record<string, string>;
  body: string;
} {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.+)\s*$/);
    if (kv) fields[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { fields, body: text.slice(match[0].length) };
}
