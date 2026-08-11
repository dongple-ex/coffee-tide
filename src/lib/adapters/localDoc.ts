// 로컬 문서 폴더 어댑터 — .txt/.md 문서에서 업무 단서 추출 (00-product-spec §3)

import { promises as fs } from "node:fs";
import { UnifiedData } from "../types/unified";
import { walkFiles } from "./fsScan";
import { toBase64Url } from "./textUtils";
import { SUPPORTED_DOCUMENT_EXTENSIONS } from "@/lib/documents/formats";
import { documentPlainText, parseDocumentBytes } from "@/lib/documents/parser";

export class LocalDocAdapter {
  constructor(private rootPath: string) {}

  async fetchRecent(limit = 10): Promise<UnifiedData[]> {
    const files = await walkFiles(
      this.rootPath,
      [...SUPPORTED_DOCUMENT_EXTENSIONS],
      100
    );
    const items: UnifiedData[] = [];

    for (const file of files) {
      if (items.length >= limit) break;
      let text: string;

      try {
        const parsed = await parseDocumentBytes({
          name: file.relPath,
          bytes: await fs.readFile(file.fullPath),
        });
        text = documentPlainText(parsed);
      } catch {
        continue;
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
