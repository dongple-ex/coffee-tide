// 실시간 사이트 수집기의 HTML/피드 파서.
//
// 기존 커스텀 뉴스 라우트는 (1) 목록 페이지의 <a> 텍스트를 그대로 기사 제목으로 쓰고
// (2) 본문은 non-greedy `<div>...</div>` 정규식으로 잘라내 첫 </div>에서 잘리는 문제가 있었다.
// 여기서는 ① RSS/Atom 자동 탐지 ② JSON-LD articleBody ③ 균형 잡힌 태그 스캔으로 본문을 온전히 확보한다.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export const DEFAULT_TIMEOUT_MS = 8000;

export interface FetchedPage {
  ok: boolean;
  status: number;
  text: string;
  contentType: string;
  finalUrl: string;
}

/** 응답이 없거나 느린 사이트가 전체 요청을 잡아먹지 않도록 항상 타임아웃을 건다. */
export async function fetchPage(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: controller.signal,
      redirect: "follow",
      next: { revalidate: 180 },
    });
    const contentType = res.headers.get("content-type") || "";
    const text = res.ok ? await res.text() : "";
    return { ok: res.ok, status: res.status, text, contentType, finalUrl: res.url || url };
  } catch {
    return { ok: false, status: 0, text: "", contentType: "", finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 사설 대역/로컬 호스트로의 요청을 차단한다 (서버가 임의 URL을 대신 호출하므로 SSRF 방어).
 * 반환값이 null이면 안전, 문자열이면 거절 사유.
 */
export function rejectUnsafeUrl(target: URL): string | null {
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return "http/https 주소만 등록할 수 있습니다.";
  }
  const host = target.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]" ||
    host === "::1"
  ) {
    return "내부망/로컬 주소는 등록할 수 없습니다.";
  }
  return null;
}

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  apos: "'",
  amp: "&",
  lt: "<",
  gt: ">",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  middot: "·",
  bull: "•",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  deg: "°",
  euro: "€",
  pound: "£",
  yen: "¥",
  times: "×",
  divide: "÷",
};

/** 태그 제거 + 숫자형/명명형 HTML 엔티티 완전 디코딩 */
export function cleanText(raw: string): string {
  if (!raw) return "";
  let text = raw.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div|li|h[1-6])>/gi, " ");
  text = text.replace(/<[^>]*>/g, "");

  text = text.replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(Number(dec)));
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => safeCodePoint(parseInt(hex, 16)));
  text = text.replace(/&([a-zA-Z]+);/g, (whole, name: string) => NAMED_ENTITIES[name] ?? whole);

  return text.replace(/[​﻿]/g, "").replace(/\s+/g, " ").trim();
}

/** 줄바꿈을 살린 정제 — 유튜브 설명란처럼 줄 구조 자체가 의미를 갖는 텍스트용 */
export function cleanMultiline(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .split("\n")
    .map((line) => cleanText(line))
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** 본문 추출 전에 스크립트·네비게이션 등 잡음 블록을 통째로 제거한다. */
export function stripNoiseBlocks(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

/**
 * 여는 태그 위치에서 시작해 중첩 깊이를 세며 닫는 태그까지 잘라낸다.
 * (non-greedy 정규식이 첫 </div>에서 끊겨 본문이 잘리던 문제의 정공법 해결)
 */
export function sliceBalancedElement(html: string, tag: string, openTagEnd: number): string {
  const scanner = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, "gi");
  scanner.lastIndex = openTagEnd;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = scanner.exec(html)) !== null) {
    if (m[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return html.slice(openTagEnd, m.index);
    } else {
      depth += 1;
    }
    if (depth > 60) break; // 비정상 마크업 방어
  }
  return html.slice(openTagEnd, Math.min(html.length, openTagEnd + 200000));
}

export function extractMeta(html: string, keys: string[]): string {
  for (const key of keys) {
    const patterns = [
      new RegExp(`<meta[^>]*property=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]*name=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${key}["']`, "i"),
      new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${key}["']`, "i"),
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m && m[1] && m[1].trim()) return cleanText(m[1]);
    }
  }
  return "";
}

export function absolutize(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/* RSS/Atom 피드 자동 탐지 & 파싱                                       */
/* ------------------------------------------------------------------ */

export function looksLikeFeed(text: string, contentType: string): boolean {
  if (/xml|rss|atom/i.test(contentType)) return true;
  const head = text.slice(0, 1500);
  return /<rss[\s>]|<feed[\s>][\s\S]*xmlns|<rdf:RDF/i.test(head);
}

/** <link rel="alternate" type="application/rss+xml"> 선언 + 관용 경로 후보를 모은다. */
export function discoverFeedUrls(html: string, baseUrl: string): string[] {
  const found: string[] = [];
  const linkRegex = /<link[^>]+>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(html)) !== null) {
    const tag = m[0];
    if (!/rel=["'][^"']*alternate/i.test(tag)) continue;
    if (!/type=["'][^"']*(rss|atom)\+xml/i.test(tag)) continue;
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (hrefMatch) {
      const abs = absolutize(cleanText(hrefMatch[1]), baseUrl);
      if (abs) found.push(abs);
    }
  }

  // 선언이 없는 국내 블로그/CMS가 많아 관용 경로도 후보로 둔다.
  try {
    const origin = new URL(baseUrl).origin;
    for (const path of ["/rss", "/feed", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml"]) {
      found.push(`${origin}${path}`);
    }
  } catch {
    /* noop */
  }

  return Array.from(new Set(found)).slice(0, 8);
}

/** 피드 자체의 제목(<channel><title>) — 사이트 이름 자동 인식에 쓴다. */
export function extractFeedTitle(xml: string): string {
  const withoutItems = xml.replace(/<(item|entry)\b[\s\S]*?<\/\1>/gi, " ");
  const m = withoutItems.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return cleanText(m[1].replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, ""));
}

export interface FeedItem {
  title: string;
  url: string;
  date: string;
  /** 피드가 제공한 본문/요약 (content:encoded 우선) */
  text: string;
}

export function parseFeed(xml: string, baseUrl: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = Array.from(xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi));

  for (const block of blocks) {
    const b = block[0];
    const title = cleanText(pickTag(b, "title"));
    if (!title) continue;

    let link = "";
    const atomLink =
      b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ||
      b.match(/<link[^>]*href=["']([^"']+)["']/i);
    if (atomLink) link = atomLink[1];
    if (!link) link = cleanText(pickTag(b, "link"));
    if (!link) link = cleanText(pickTag(b, "guid"));
    link = absolutize(link, baseUrl) || baseUrl;

    // content:encoded > content > description > summary 순으로 본문이 풍부하다.
    const body =
      pickTag(b, "content:encoded") ||
      pickTag(b, "content") ||
      pickTag(b, "description") ||
      pickTag(b, "summary") ||
      pickTag(b, "media:description") ||
      "";

    const rawDate =
      pickTag(b, "pubDate") || pickTag(b, "published") || pickTag(b, "updated") || pickTag(b, "dc:date");

    items.push({
      title,
      url: link,
      date: formatDate(rawDate),
      // 유튜브 설명란의 목차/구분선처럼 줄 구조가 의미를 갖는 경우가 있어 줄바꿈을 보존한다.
      text: cleanMultiline(body),
    });
  }
  return items;
}

function pickTag(block: string, tag: string): string {
  const escaped = tag.replace(/[:]/g, "\\:");
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  return m[1].replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "");
}

export function formatDate(rawDate: string): string {
  if (!rawDate) return "최신";
  const d = new Date(rawDate.trim());
  if (isNaN(d.getTime())) return "최신";

  const now = Date.now();
  const diffH = (now - d.getTime()) / 3600000;
  if (diffH >= 0 && diffH < 1) return "방금";
  if (diffH >= 0 && diffH < 24) return `${Math.floor(diffH)}시간 전`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

/* ------------------------------------------------------------------ */
/* 기사 본문 추출                                                       */
/* ------------------------------------------------------------------ */

export interface ExtractedArticle {
  text: string;
  /** full = 실제 본문 확보, meta = 메타 설명만, title = 실패 */
  depth: "full" | "meta" | "title";
}

/** 피드에 날짜가 없는 언론사(한겨레 등)를 위해 기사 페이지 메타에서 발행일을 보충한다. */
export function extractPublishedDate(html: string): string {
  const meta = extractMeta(html, [
    "article:published_time",
    "og:regDate",
    "datePublished",
    "dateCreated",
    "date",
  ]);
  if (meta) return meta;
  const jsonLd = html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
  return jsonLd ? jsonLd[1] : "";
}

const CONTENT_HINT =
  /(article|news|entry|post|content|body|view|read|story|txt|se-main|contents)/i;

/**
 * 기사 원문 HTML → 본문 텍스트.
 * ① JSON-LD articleBody ② <article> ③ 본문 후보 컨테이너 ④ 문서 전체 <p> 밀집 구간 ⑤ 메타 설명
 */
export function extractArticleText(html: string): ExtractedArticle {
  const jsonLd = extractJsonLdBody(html);
  if (jsonLd.length > 200) return { text: jsonLd, depth: "full" };

  const clean = stripNoiseBlocks(html);

  const candidates: string[] = [];

  const articleOpen = clean.match(/<article\b[^>]*>/i);
  if (articleOpen && articleOpen.index !== undefined) {
    candidates.push(
      sliceBalancedElement(clean, "article", articleOpen.index + articleOpen[0].length)
    );
  }

  const mainOpen = clean.match(/<main\b[^>]*>/i);
  if (mainOpen && mainOpen.index !== undefined) {
    candidates.push(sliceBalancedElement(clean, "main", mainOpen.index + mainOpen[0].length));
  }

  const divRegex = /<div\b[^>]*(?:id|class)=["']([^"']*)["'][^>]*>/gi;
  let dm: RegExpExecArray | null;
  let scanned = 0;
  while ((dm = divRegex.exec(clean)) !== null && scanned < 40) {
    if (!CONTENT_HINT.test(dm[1])) continue;
    scanned += 1;
    candidates.push(sliceBalancedElement(clean, "div", dm.index + dm[0].length));
  }

  // 후보 중 '링크 밀도가 낮고 문단이 풍부한' 블록을 본문으로 채택한다.
  // 링크 밀도를 보지 않으면 기사 목록/사이드바가 본문으로 뽑혀 모든 카드가 같은 내용이 된다.
  let best = "";
  let bestScore = 0;
  for (const c of candidates) {
    const density = linkDensity(c);
    if (density > 0.4) continue;
    const t = paragraphsOf(c);
    const score = t.length * (1 - density);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best.length >= 200) return { text: best, depth: "full" };

  const whole = linkDensity(clean) <= 0.5 ? paragraphsOf(clean) : "";
  if (whole.length >= 200) return { text: whole, depth: "full" };

  const meta = extractMeta(html, ["og:description", "description", "twitter:description"]);
  const fallback = [best, whole, meta].sort((a, b) => b.length - a.length)[0] || "";
  if (fallback.length >= 120) return { text: fallback, depth: "full" };
  if (fallback) return { text: fallback, depth: "meta" };
  return { text: "", depth: "title" };
}

/** co.kr·or.kr 같은 2단계 국가 도메인을 감안한 등록 도메인 추출 */
export function registrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const secondLevel = ["co", "or", "ne", "go", "re", "pe", "ac", "com", "net", "org"];
  return secondLevel.includes(parts[parts.length - 2])
    ? parts.slice(-3).join(".")
    : parts.slice(-2).join(".");
}

/** 텍스트 중 링크가 차지하는 비율 — 네비게이션·기사 목록 블록을 걸러내는 신호 */
function linkDensity(html: string): number {
  const total = cleanText(html).length;
  if (total < 40) return 1;
  const anchorText = Array.from(html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi))
    .map((m) => cleanText(m[1]))
    .join(" ").length;
  return Math.min(1, anchorText / total);
}

function paragraphsOf(html: string): string {
  const parts = Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .filter((m) => linkDensity(m[1]) < 0.5) // 링크 목록으로 채워진 문단 제외
    .map((m) => cleanText(m[1]))
    .filter((t) => t.length > 15 && !isBoilerplateText(t));

  if (parts.length > 0) return dedupeJoin(parts);

  // <p> 없이 <br>로만 구분한 국내 CMS 대응
  const raw = cleanText(html);
  if (raw.length > 200) return raw.slice(0, 8000);
  return "";
}

function dedupeJoin(parts: string[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const p of parts) {
    const key = p.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(p);
    if (kept.join(" ").length > 8000) break;
  }
  return kept.join(" ");
}

function extractJsonLdBody(html: string): string {
  const blocks = Array.from(
    html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  );
  for (const b of blocks) {
    try {
      const parsed: unknown = JSON.parse(b[1].trim());
      const body = findArticleBody(parsed);
      if (body) return cleanText(body);
    } catch {
      /* 잘못된 JSON-LD는 건너뛴다 */
    }
  }
  return "";
}

function findArticleBody(node: unknown, depth = 0): string {
  if (!node || depth > 4) return "";
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findArticleBody(n, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.articleBody === "string" && obj.articleBody.length > 100) {
      return obj.articleBody;
    }
    for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "hasPart"]) {
      const found = findArticleBody(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return "";
}

/** 언론사 UI·저작권 문구 등 의미 없는 조각 필터 */
export function isBoilerplateText(text: string): boolean {
  if (!text) return true;
  const lower = text.toLowerCase();
  const noise = [
    "구독되었습니다",
    "언론사 구독",
    "구독 해지",
    "구독하기",
    "뉴스판",
    "보러가기",
    "주요뉴스",
    "주요기사로 선정",
    "주요기사로선정한",
    "닫기",
    "무단전재",
    "재배포 금지",
    "무단 전재",
    "copyright",
    "all rights reserved",
    "기자의 다른기사",
    "기자 페이지",
    "로그인",
    "회원가입",
    "이용약관",
    "개인정보처리방침",
    "전체보기",
    "더보기",
    "댓글쓰기",
    "관련기사",
    "이 기사를 공유합니다",
    "사진제공",
    "제보하기",
    "광고문의",
    "javascript",
    "쿠키",
  ];
  return noise.some((kw) => lower.includes(kw));
}

/** 목록 페이지의 <a>가 '기사 링크'처럼 보이는지 판정 */
export function looksLikeArticleLink(href: string, origin: string): boolean {
  if (!href.startsWith("http")) return false;
  let u: URL;
  let base: URL;
  try {
    u = new URL(href);
    base = new URL(origin);
  } catch {
    return false;
  }
  // 언론사는 기사 전용 서브도메인(n.news.naver.com 등)을 쓰는 경우가 많아 등록 도메인 단위로 비교한다.
  if (registrableDomain(u.hostname) !== registrableDomain(base.hostname)) return false;
  const path = u.pathname;
  const search = u.search;
  if (path === "/" || path.length < 5) return false;
  if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|mp4|css|js)$/i.test(path)) return false;
  if (/(login|signup|join|member|privacy|terms|subscribe|search|tag|category|about|contact)/i.test(path)) {
    return false;
  }

  // 네이버 스포츠 / 모바일 스포츠 기사 URL 특별 통과 (oid=, aid=, /read, /article/)
  if (/(oid=|aid=|\/read|\/article\/)/i.test(path + search)) {
    return true;
  }

  // 기사 URL은 보통 숫자 ID 또는 충분히 긴 슬러그를 가진다.
  return /\d{3,}/.test(path) || path.split("/").filter(Boolean).some((seg) => seg.length >= 10);
}
