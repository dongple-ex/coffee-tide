import { extractTextFromDocx } from "@/lib/adapters/docxParser";
import { documentExtension, isSupportedDocument } from "./formats";

export type DocumentKind =
  | "text"
  | "markdown"
  | "csv"
  | "json"
  | "markup"
  | "docx"
  | "pdf"
  | "xlsx"
  | "pptx";

const MAX_EXTRACTED_TEXT_CHARS = 500_000;

export interface ExtractedDocumentBlock {
  text: string;
  page?: number;
  sheet?: string;
  slide?: number;
  heading?: string;
  cellRange?: string;
}

export interface ExtractedDocument {
  title: string;
  kind: DocumentKind;
  blocks: ExtractedDocumentBlock[];
  metadata: Record<string, string | number>;
  warnings: string[];
}

export class UnsupportedDocumentError extends Error {
  constructor(fileName: string) {
    super(`지원하지 않는 문서 형식입니다: ${fileName}`);
    this.name = "UnsupportedDocumentError";
  }
}

export class EmptyDocumentError extends Error {
  constructor(fileName: string) {
    super(`문서에서 읽을 수 있는 텍스트를 찾지 못했습니다: ${fileName}`);
    this.name = "EmptyDocumentError";
  }
}

interface DocumentBytesInput {
  name: string;
  mimeType?: string;
  bytes: Uint8Array;
}

function kindFor(extension: string): DocumentKind {
  if (extension === ".docx") return "docx";
  if (extension === ".pdf") return "pdf";
  if (extension === ".xlsx") return "xlsx";
  if (extension === ".pptx") return "pptx";
  if (extension === ".md" || extension === ".markdown") return "markdown";
  if (extension === ".csv") return "csv";
  if (extension === ".json") return "json";
  if (extension === ".html" || extension === ".htm" || extension === ".xml") {
    return "markup";
  }
  return "text";
}

function cleanMarkup(content: string): string {
  return content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeText(content: string): string {
  return content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

export async function parseDocumentBytes(input: DocumentBytesInput): Promise<ExtractedDocument> {
  if (!isSupportedDocument(input.name, input.mimeType)) {
    throw new UnsupportedDocumentError(input.name);
  }

  const extension = documentExtension(input.name);
  const kind = kindFor(extension);
  let blocks: ExtractedDocumentBlock[];
  let metadata: Record<string, string | number> = {};
  const warnings: string[] = [];

  if (kind === "docx") {
    blocks = [{ text: await extractTextFromDocx(exactArrayBuffer(input.bytes)) }];
  } else if (kind === "pdf") {
    const parsed = await (await import("./pdfParser")).parsePdfBlocks(input.bytes);
    blocks = parsed.blocks;
    metadata = parsed.metadata;
    warnings.push(...parsed.warnings);
  } else if (kind === "xlsx" || kind === "pptx") {
    const parsed = await (await import("./officeOpenXml")).parseOfficeOpenXml(input.bytes, kind);
    blocks = parsed.blocks;
    metadata = parsed.metadata;
    warnings.push(...parsed.warnings);
  } else {
    let text = new TextDecoder("utf-8", { fatal: false }).decode(input.bytes);
    if (kind === "markup") text = cleanMarkup(text);
    blocks = [{ text }];
  }

  let remaining = MAX_EXTRACTED_TEXT_CHARS;
  const normalizedBlocks: ExtractedDocumentBlock[] = [];
  for (const block of blocks) {
    const text = normalizeText(block.text);
    if (!text || remaining <= 0) continue;
    const limited = text.slice(0, remaining);
    normalizedBlocks.push({ ...block, text: limited });
    remaining -= limited.length;
    if (limited.length < text.length) break;
  }
  if (!normalizedBlocks.length) throw new EmptyDocumentError(input.name);
  if (remaining <= 0) warnings.push("추출 텍스트가 50만 자를 넘어 이후 내용은 생략했습니다.");

  return {
    title: input.name,
    kind,
    blocks: normalizedBlocks,
    metadata: {
      extension: extension || input.mimeType || "text",
      bytes: input.bytes.byteLength,
      ...metadata,
    },
    warnings,
  };
}

export async function parseDocumentFile(file: File): Promise<ExtractedDocument> {
  return parseDocumentBytes({
    name: file.name,
    mimeType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
}

export function documentPlainText(document: ExtractedDocument): string {
  return document.blocks
    .map((block) => {
      const source = block.page
        ? `[페이지 ${block.page}]`
        : block.sheet
          ? `[시트 ${block.sheet}${block.cellRange ? ` · ${block.cellRange}` : ""}]`
          : block.slide
            ? `[슬라이드 ${block.slide}]`
            : "";
      return source ? `${source}\n${block.text}` : block.text;
    })
    .filter(Boolean)
    .join("\n\n");
}
