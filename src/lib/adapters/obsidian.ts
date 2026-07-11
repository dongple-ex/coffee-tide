// Obsidian 어댑터 — 볼트에서 미완료 체크박스 추출, 빠른 캡처(수집함 append),
// 완료 write-back(체크 처리), LLM 일일 다이제스트 미러링 (phase6 §8, Q4=자동).

import { promises as fs } from "node:fs";
import path from "node:path";
import { UnifiedData } from "../types/unified";
import { walkFiles } from "./fsScan";
import { excerpt, fromBase64Url, toBase64Url } from "./textUtils";

const CAPTURE_NOTE = "coffeTide_수집함.md";
const LLM_DIGEST_DIR = "coffeTide_LLM";

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
        items.push({
          id: `obs-${toBase64Url(`${file.relPath}|${i}`)}`,
          source: "obsidian",
          title: match[1].trim(),
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
    const fullPath = path.join(this.vaultPath, relPath);

    const text = await fs.readFile(fullPath, "utf8");
    const lines = text.split(/\r?\n/);
    if (!lines[lineNo] || !/\[ \]/.test(lines[lineNo])) {
      throw new Error("대상 체크박스를 찾을 수 없습니다 (노트가 수정되었을 수 있음)");
    }
    lines[lineNo] = lines[lineNo].replace("[ ]", "[x]");
    await fs.writeFile(fullPath, lines.join("\n"), "utf8");
  }

  /** 빠른 캡처 — 수집함 노트에 체크박스 항목 append (백로그 F3: 데일리노트 옵션은 후속) */
  async captureTask(title: string, content?: string): Promise<string> {
    const notePath = path.join(this.vaultPath, CAPTURE_NOTE);
    let existing = "";
    try {
      existing = await fs.readFile(notePath, "utf8");
    } catch {
      existing = `# coffeTide 수집함\n`;
    }
    const line = `- [ ] ${title}${content ? ` — ${excerpt(content, 120)}` : ""}`;
    await fs.writeFile(notePath, `${existing.trimEnd()}\n${line}\n`, "utf8");
    return CAPTURE_NOTE;
  }

  /**
   * LLM 일일 다이제스트 upsert — phase6 §8. 내용이 동일하면 미기록(idempotent).
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

    const body =
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
