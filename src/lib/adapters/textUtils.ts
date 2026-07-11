// HTML 정제 필터 — doc/2-data_processing.md §2.2

export function cleanHtmlContent(
  content: string,
  type?: "html" | "text" | null
): string {
  if (!content) return "";
  if (type === "text") return content.trim();

  return content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerpt(text: string, max = 500): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max) + "…";
}

export function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

export function fromBase64Url(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}
