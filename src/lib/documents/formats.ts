export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".log",
  ".html",
  ".htm",
  ".xml",
  ".docx",
  ".pdf",
  ".xlsx",
  ".pptx",
] as const;

export const DOCUMENT_INPUT_ACCEPT = [
  ...SUPPORTED_DOCUMENT_EXTENSIONS,
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/json",
  "application/xml",
  "text/xml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
].join(",");

export const SUPPORTED_DOCUMENT_DISPLAY =
  "TXT, Markdown, CSV, JSON, LOG, HTML/XML, DOCX, PDF, XLSX, PPTX";

export const MAX_DOCUMENT_UPLOAD_BYTES = 2 * 1024 * 1024;

export function documentExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

export function isSupportedDocument(fileName: string, mimeType = ""): boolean {
  const extension = documentExtension(fileName);
  if ((SUPPORTED_DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) return true;

  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  );
}
