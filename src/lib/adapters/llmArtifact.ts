// LLM 산출물 어댑터 — doc/phase6_llm_artifacts_spec.md §6.
// 폴더 재귀 스캔(.md/.txt), frontmatter 파싱, 원문 노출 없이 발췌만(§12 프라이버시).

import { promises as fs } from "node:fs";
import { UnifiedData } from "../types/unified";
import { parseFrontmatter, walkFiles } from "./fsScan";
import { excerpt, toBase64Url } from "./textUtils";

function inferAuthor(filePath: string, fields: Record<string, string>): string {
  const p = filePath.toLowerCase();
  if (p.includes("claude")) return "Claude";
  if (p.includes("gemini")) return "Gemini";
  if (fields.author) return fields.author;
  return "LLM";
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export class LlmArtifactAdapter {
  constructor(private rootPath: string) {}

  async fetchArtifacts(opts?: { todayOnly?: boolean; limit?: number }): Promise<UnifiedData[]> {
    const limit = opts?.limit ?? 20;
    const files = await walkFiles(this.rootPath, [".md", ".txt"], 200);
    const now = new Date();
    const items: UnifiedData[] = [];

    for (const file of files) {
      if (items.length >= limit) break;
      if (opts?.todayOnly && !isSameLocalDay(file.mtime, now)) continue;

      let text: string;
      try {
        text = await fs.readFile(file.fullPath, "utf8");
      } catch {
        continue;
      }
      const { fields, body } = parseFrontmatter(text);
      const heading = body.match(/^#\s+(.+)$/m)?.[1];
      const fileName = file.relPath.replace(/\.(md|txt)$/i, "");

      items.push({
        id: `llm-${toBase64Url(file.relPath)}`,
        source: "llm",
        title: fields.name || heading || fileName,
        content: [fields.description, excerpt(body, 500)].filter(Boolean).join(" — "),
        created_at: file.mtime.toISOString(),
        author: { name: inferAuthor(file.fullPath, fields) },
        url: `file:///${file.fullPath.replace(/\\/g, "/")}`,
        category: "reference",
        status: "pending",
      });
    }
    return items;
  }
}
