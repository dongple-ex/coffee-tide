// 로컬 문서 폴더 어댑터 — .txt/.md 문서에서 업무 단서 추출 (00-current-state §3)

import { promises as fs } from "node:fs";
import { UnifiedData } from "../types/unified";
import { walkFiles } from "./fsScan";
import { cleanHtmlContent, toBase64Url } from "./textUtils";

export class LocalDocAdapter {
  constructor(private rootPath: string) {}

  async fetchRecent(limit = 10): Promise<UnifiedData[]> {
    const files = await walkFiles(this.rootPath, [".md", ".txt", ".html", ".htm", ".xml"], 100);
    const items: UnifiedData[] = [];

    for (const file of files) {
      if (items.length >= limit) break;
      let text: string;
      try {
        text = await fs.readFile(file.fullPath, "utf8");
      } catch {
        continue;
      }

      const ext = file.relPath.slice(file.relPath.lastIndexOf(".")).toLowerCase();
      if (ext === ".html" || ext === ".htm" || ext === ".xml") {
        text = cleanHtmlContent(text);
      }

      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length && items.length < limit; i++) {
        const todo =
          lines[i].match(/^\s*[-*]\s*\[ \]\s*(.+)$/) ||
          lines[i].match(/^\s*TODO[:：]\s*(.+)$/i);
        if (!todo) continue;
        items.push({
          id: `doc-${toBase64Url(`${file.relPath}|${i}`)}`,
          source: "local_doc",
          title: todo[1].trim(),
          content: `문서 '${file.relPath}'에서 추출된 할 일`,
          created_at: file.mtime.toISOString(),
          author: { name: "로컬 문서" },
          url: `file:///${file.fullPath.replace(/\\/g, "/")}`,
          status: "pending",
        });
      }
    }
    return items;
  }
}
