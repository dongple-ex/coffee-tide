import type { ExtractedDocumentBlock } from "./parser";

const MAX_PDF_PAGES = 200;

interface PdfTextItemLike {
  str?: string;
  hasEOL?: boolean;
}

function textFromItems(items: unknown[]): string {
  let result = "";

  for (const value of items) {
    if (!value || typeof value !== "object" || !("str" in value)) continue;
    const item = value as PdfTextItemLike;
    if (typeof item.str !== "string" || !item.str) continue;

    if (result && !/[\s\n]$/.test(result)) result += " ";
    result += item.str;
    if (item.hasEOL) result += "\n";
  }

  return result.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function parsePdfBlocks(bytes: Uint8Array): Promise<{
  blocks: ExtractedDocumentBlock[];
  metadata: Record<string, string | number>;
  warnings: string[];
}> {
  // Next 서버 청크와 브라우저 폴더 스캔 모두 상대 worker URL을 안정적으로
  // 해석하기 어렵기 때문에 공식 worker 핸들러를 동적으로 불러 fake worker로 사용한다.
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as typeof globalThis & {
    pdfjsWorker?: { WorkerMessageHandler: typeof worker.WorkerMessageHandler };
  }).pdfjsWorker = { WorkerMessageHandler: worker.WorkerMessageHandler };

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: true,
  });

  try {
    const pdf = await loadingTask.promise;
    const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const blocks: ExtractedDocumentBlock[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = textFromItems(content.items);
      if (text) blocks.push({ text, page: pageNumber });
      page.cleanup();
    }

    const warnings: string[] = [];
    if (pdf.numPages > MAX_PDF_PAGES) {
      warnings.push(`PDF는 앞 ${MAX_PDF_PAGES}페이지만 읽었습니다.`);
    }

    return {
      blocks,
      metadata: { pages: pdf.numPages },
      warnings,
    };
  } finally {
    await loadingTask.destroy();
  }
}
