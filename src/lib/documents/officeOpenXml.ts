import JSZip, { type JSZipObject } from "jszip";
import type { ExtractedDocumentBlock } from "./parser";

const MAX_OFFICE_PART_CHARS = 2_000_000;
const MAX_SHEETS = 100;
const MAX_SLIDES = 200;
const MAX_COLUMNS_PER_ROW = 256;

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function attribute(tag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp(`\\s${escaped}=["']([^"']*)["']`, "i"))?.[1];
}

async function xmlText(entry: JSZipObject | null | undefined): Promise<string> {
  if (!entry) return "";
  const value = await entry.async("string");
  if (value.length > MAX_OFFICE_PART_CHARS) {
    throw new Error("Office 문서 내부 XML이 허용 크기를 초과했습니다.");
  }
  return value;
}

function normalizeZipPath(base: string, target: string): string {
  const raw = target.startsWith("/") ? target.slice(1) : `${base}/${target}`;
  const parts: string[] = [];
  for (const part of raw.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function columnIndex(address: string): number {
  const letters = address.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, index - 1);
}

function textNodes(xml: string, tagName: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  for (const match of xml.matchAll(pattern)) {
    values.push(decodeXml(match[1].replace(/<[^>]+>/g, "")));
  }
  return values;
}

function sharedStrings(xml: string): string[] {
  const values: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)) {
    values.push(textNodes(match[1], "t").join(""));
  }
  return values;
}

function worksheetBlock(
  xml: string,
  sheet: string,
  strings: string[]
): ExtractedDocumentBlock | null {
  const rows: string[] = [];
  let firstCell = "";
  let lastCell = "";

  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const cellTag = `<c ${cellMatch[1]}>`;
      const address = attribute(cellTag, "r") ?? "A1";
      const index = columnIndex(address);
      if (index >= MAX_COLUMNS_PER_ROW) continue;

      const type = attribute(cellTag, "t") ?? "";
      const body = cellMatch[2];
      const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? "";
      const inline = textNodes(body, "t").join("");
      const formula = body.match(/<f\b[^>]*>([\s\S]*?)<\/f>/i)?.[1];
      let value = decodeXml(raw);

      if (type === "s") value = strings[Number.parseInt(value, 10)] ?? value;
      else if (type === "inlineStr" || type === "str") value = inline || value;
      else if (type === "b") value = value === "1" ? "TRUE" : "FALSE";
      if (!value && formula) value = `=${decodeXml(formula)}`;

      cells[index] = value;
      if (!firstCell) firstCell = address;
      lastCell = address;
    }
    if (cells.some((value) => value)) rows.push(cells.map((value) => value ?? "").join("\t"));
  }

  if (!rows.length) return null;
  return {
    text: rows.join("\n"),
    sheet,
    cellRange: firstCell && lastCell ? `${firstCell}:${lastCell}` : undefined,
  };
}

async function parseXlsx(zip: JSZip): Promise<{
  blocks: ExtractedDocumentBlock[];
  metadata: Record<string, string | number>;
  warnings: string[];
}> {
  const workbook = await xmlText(zip.file("xl/workbook.xml"));
  const relationships = await xmlText(zip.file("xl/_rels/workbook.xml.rels"));
  const strings = sharedStrings(await xmlText(zip.file("xl/sharedStrings.xml")));
  const targets = new Map<string, string>();

  for (const match of relationships.matchAll(/<Relationship\b[^>]*\/?\s*>/gi)) {
    const id = attribute(match[0], "Id");
    const target = attribute(match[0], "Target");
    if (id && target) targets.set(id, normalizeZipPath("xl", target));
  }

  const sheets: Array<{ name: string; path: string }> = [];
  for (const match of workbook.matchAll(/<sheet\b[^>]*\/?\s*>/gi)) {
    const name = decodeXml(attribute(match[0], "name") ?? `Sheet ${sheets.length + 1}`);
    const relationId = attribute(match[0], "r:id");
    const path = relationId ? targets.get(relationId) : undefined;
    if (path) sheets.push({ name, path });
    if (sheets.length >= MAX_SHEETS) break;
  }

  if (!sheets.length) {
    const paths = Object.keys(zip.files)
      .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    paths.slice(0, MAX_SHEETS).forEach((path, index) => {
      sheets.push({ name: `Sheet ${index + 1}`, path });
    });
  }

  const blocks: ExtractedDocumentBlock[] = [];
  for (const sheet of sheets) {
    const block = worksheetBlock(await xmlText(zip.file(sheet.path)), sheet.name, strings);
    if (block) blocks.push(block);
  }

  return {
    blocks,
    metadata: { sheets: sheets.length },
    warnings: ["Excel 수식은 파일에 저장된 계산 결과를 우선 표시합니다."],
  };
}

async function parsePptx(zip: JSZip): Promise<{
  blocks: ExtractedDocumentBlock[];
  metadata: Record<string, string | number>;
  warnings: string[];
}> {
  const slides = Object.keys(zip.files)
    .map((path) => ({ path, number: Number(path.match(/^ppt\/slides\/slide(\d+)\.xml$/i)?.[1]) }))
    .filter((slide) => Number.isFinite(slide.number))
    .sort((a, b) => a.number - b.number)
    .slice(0, MAX_SLIDES);

  const blocks: ExtractedDocumentBlock[] = [];
  for (const slide of slides) {
    const xml = await xmlText(zip.file(slide.path));
    const text = textNodes(xml, "a:t").map((value) => value.trim()).filter(Boolean).join("\n");
    if (text) blocks.push({ text, slide: slide.number });
  }

  const warnings: string[] = [];
  const totalSlides = Object.keys(zip.files).filter((path) =>
    /^ppt\/slides\/slide\d+\.xml$/i.test(path)
  ).length;
  if (totalSlides > MAX_SLIDES) {
    warnings.push(`PowerPoint는 앞 ${MAX_SLIDES}개 슬라이드만 읽었습니다.`);
  }

  return { blocks, metadata: { slides: totalSlides }, warnings };
}

export async function parseOfficeOpenXml(
  bytes: Uint8Array,
  kind: "xlsx" | "pptx"
): Promise<{
  blocks: ExtractedDocumentBlock[];
  metadata: Record<string, string | number>;
  warnings: string[];
}> {
  const zip = await JSZip.loadAsync(Uint8Array.from(bytes));
  return kind === "xlsx" ? parseXlsx(zip) : parsePptx(zip);
}
