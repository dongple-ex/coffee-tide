// Obsidian 어댑터 — 볼트에서 미완료 체크박스 추출, 빠른 캡처(수집함/데일리노트),
// 완료 write-back(체크 처리), LLM 일일 다이제스트 미러링 (phase6 §8, Q4=자동).

import { promises as fs } from "node:fs";
import path from "node:path";
import { UnifiedData } from "../types/unified";
import { walkFiles } from "./fsScan";
import { excerpt, fromBase64Url, toBase64Url } from "./textUtils";
import {
  formatObsidianTaskLine,
  insertUnderHeading,
  type ObsidianTaskOptions,
} from "./obsidianFormat";

export { type ObsidianTaskOptions, formatObsidianTaskLine, insertUnderHeading } from "./obsidianFormat";

const CAPTURE_NOTE = "coffeeTide_수집함.md";
const LLM_DIGEST_DIR = "coffeeTide_LLM";

export class ObsidianAdapter {
  constructor(private vaultPath: string) {}

  async fetchRecent(limit = 10): Promise<UnifiedData[]> {
    const files = await walkFiles(this.vaultPath, [".md"], 100);
    const items: UnifiedData[] = [];

    for (const file of files) {
      if (items.length >= limit) break;
      let text: string;
      try {
        text = await fs.readFile(file.fullPath, "utf8");
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length && items.length < limit; i++) {
        const match = lines[i].match(/^\s*[-*]\s*\[ \]\s*(.+)$/);
        if (!match) continue;
        const taskText = match[1].trim();

        items.push({
          id: `obs-${toBase64Url(`${file.relPath}|${i}`)}`,
          source: "obsidian",
          title: taskText,
          content: `노트 '${file.relPath.replace(/\.md$/, "")}'의 미완료 항목`,
          created_at: file.mtime.toISOString(),
          author: { name: "Obsidian Vault" },
          url: `obsidian://open?file=${encodeURIComponent(file.relPath.replace(/\.md$/, ""))}`,
          status: "pending",
        });
      }
    }
    return items;
  }

  /** 완료 write-back — id에 인코딩된 파일/줄의 체크박스를 [x]로 갱신 */
  async completeTask(id: string): Promise<void> {
    const decoded = fromBase64Url(id.replace(/^obs-/, ""));
    const sep = decoded.lastIndexOf("|");
    const relPath = decoded.slice(0, sep);
    const lineNo = Number(decoded.slice(sep + 1));
    const fullPath = path.resolve(this.vaultPath, relPath);

    // id는 클라이언트가 임의 조작 가능 — 볼트 밖 경로(../ 탈출)로의 읽기/쓰기를 차단
    const vaultRoot = path.resolve(this.vaultPath);
    if (fullPath !== vaultRoot && !fullPath.startsWith(vaultRoot + path.sep)) {
      throw new Error("대상 체크박스를 찾을 수 없습니다 (노트가 수정되었을 수 있음)");
    }

    const text = await fs.readFile(fullPath, "utf8");
    const lines = text.split(/\r?\n/);
    if (!lines[lineNo] || !/\[ \]/.test(lines[lineNo])) {
      throw new Error("대상 체크박스를 찾을 수 없습니다 (노트가 수정되었을 수 있음)");
    }
    lines[lineNo] = lines[lineNo].replace("[ ]", "[x]");
    await fs.writeFile(fullPath, lines.join("\n"), "utf8");
  }

  /** 빠른 캡처 — 수집함 또는 데일리노트에 Tasks/Dataview 포맷으로 항목 append/insert */
  async captureTask(
    title: string,
    content?: string,
    options?: ObsidianTaskOptions
  ): Promise<string> {
    const isDaily = options?.targetNote === "daily";
    const dateKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    let noteRelPath = CAPTURE_NOTE;
    if (isDaily) {
      const dailyDir = options?.dailyFolder?.trim() || "";
      noteRelPath = dailyDir ? path.join(dailyDir, `${dateKey}.md`) : `${dateKey}.md`;
    }

    const noteFullPath = path.join(this.vaultPath, noteRelPath);
    await fs.mkdir(path.dirname(noteFullPath), { recursive: true });

    let existing = "";
    try {
      existing = await fs.readFile(noteFullPath, "utf8");
    } catch {
      existing = isDaily ? `# ${dateKey}\n` : `# coffeeTide 수집함\n`;
    }

    const line = formatObsidianTaskLine(title, content, options);
    const updated = insertUnderHeading(existing, line, options?.heading);
    await fs.writeFile(noteFullPath, updated, "utf8");

    return noteRelPath;
  }

  /**
   * LLM 일일 다이제스트 upsert — phase6 §8. Frontmatter 및 Tasks 규격 적용.
   */
  static async writeLlmDigest(
    vaultPath: string,
    dateKey: string,
    items: UnifiedData[]
  ): Promise<boolean> {
    if (items.length === 0) return false;
    const dir = path.join(vaultPath, LLM_DIGEST_DIR);
    await fs.mkdir(dir, { recursive: true });
    const notePath = path.join(dir, `${dateKey}.md`);

    const frontmatter =
      `---\n` +
      `date: ${dateKey}\n` +
      `tags:\n` +
      `  - coffeeTide\n` +
      `  - coffeeTide/llm-digest\n` +
      `item_count: ${items.length}\n` +
      `---\n\n`;

    const body =
      frontmatter +
      `# ${dateKey} LLM 작업 다이제스트\n\n` +
      items
        .map(
          (item) =>
            `- [${item.title}](${item.url}) — ${excerpt(item.content, 100)} (${item.author.name})`
        )
        .join("\n") +
      "\n";

    try {
      const current = await fs.readFile(notePath, "utf8");
      if (current === body) return false;
    } catch {
      // 파일 없음 → 신규 작성
    }
    await fs.writeFile(notePath, body, "utf8");
    return true;
  }
}
