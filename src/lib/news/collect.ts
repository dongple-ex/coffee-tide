// 등록한 사이트 1곳에서 '최신 글 + 실제 본문'을 확보하는 수집 파이프라인.
//
// 수집 우선순위: RSS/Atom 피드 > 유튜브 채널 피드 > HTML 목록 휴리스틱.
// 피드를 먼저 찾는 이유: 목록 페이지의 <a> 텍스트를 긁으면 네비게이션/광고가 기사로 둔갑해
// "내용이 부족한" 카드가 만들어지기 때문이다. 확보한 링크는 2차 딥 페치로 본문까지 채운다.

import {
  cleanText,
  discoverFeedUrls,
  extractArticleText,
  extractFeedTitle,
  extractMeta,
  extractPublishedDate,
  fetchPage,
  formatDate,
  isBoilerplateText,
  looksLikeArticleLink,
  looksLikeFeed,
  parseFeed,
  rejectUnsafeUrl,
} from "./htmlParse";
import { cleanYoutubeDescription } from "./summarize";
import type { ContentDepth } from "./types";

export interface CollectedItem {
  title: string;
  url: string;
  date: string;
  /** 확보한 원문 텍스트 */
  text: string;
  depth: ContentDepth;
}

export interface CollectResult {
  ok: boolean;
  siteName: string;
  autoSiteName: string;
  url: string;
  feedUrl?: string;
  strategy: "feed" | "youtube" | "html";
  isVideo: boolean;
  items: CollectedItem[];
  reason?: string;
  hint?: string;
}

export interface CollectOptions {
  url: string;
  siteName?: string;
  limit?: number;
  /** true면 개별 글 본문까지 2차 페치 (미리보기에서는 false) */
  deep?: boolean;
}

const DEEP_MIN_CHARS = 400;

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function collectSiteContent(opts: CollectOptions): Promise<CollectResult> {
  const limit = opts.limit ?? 6;
  const deep = opts.deep ?? true;
  const targetUrl = normalizeUrl(opts.url);

  let urlObj: URL;
  try {
    urlObj = new URL(targetUrl);
  } catch {
    return fail(targetUrl, "주소 형식이 올바르지 않습니다.", "예: news.naver.com 또는 https://블로그주소/rss");
  }

  const unsafe = rejectUnsafeUrl(urlObj);
  if (unsafe) return fail(targetUrl, unsafe, "공개된 웹사이트 주소를 입력해 주세요.");

  const page = await fetchPage(targetUrl);
  if (!page.ok) {
    // 메인 페이지가 막혀도 관용 피드 경로가 살아있는 경우가 많다.
    const rescued = await tryFeedCandidates(discoverFeedUrls("", targetUrl), limit);
    if (rescued) {
      return {
        ok: true,
        siteName: opts.siteName?.trim() || urlObj.hostname.replace(/^www\./, ""),
        autoSiteName: urlObj.hostname.replace(/^www\./, ""),
        url: targetUrl,
        feedUrl: rescued.feedUrl,
        strategy: "feed",
        isVideo: false,
        items: await enrich(rescued.items, deep, limit),
      };
    }
    return fail(
      targetUrl,
      page.status ? `사이트가 응답하지 않았습니다 (HTTP ${page.status}).` : "사이트 접속에 실패했습니다.",
      "주소를 다시 확인하거나, 해당 사이트의 RSS 주소를 직접 입력해 보세요."
    );
  }

  const html = page.text;
  const hostname = urlObj.hostname;
  const isYouTube = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(hostname);

  // ① 입력 자체가 피드인 경우
  if (looksLikeFeed(html, page.contentType)) {
    const items = parseFeed(html, targetUrl).slice(0, limit);
    const autoName = sanitizeSiteName(extractFeedTitle(html)) || hostname.replace(/^www\./, "");
    if (items.length > 0) {
      return {
        ok: true,
        siteName: opts.siteName?.trim() || autoName,
        autoSiteName: autoName,
        url: targetUrl,
        feedUrl: targetUrl,
        strategy: "feed",
        isVideo: /youtube\.com/i.test(targetUrl),
        items: await enrich(items, deep, limit),
      };
    }
  }

  const autoSiteName = detectSiteName(html, hostname, isYouTube);
  const siteName = opts.siteName?.trim() || autoSiteName;

  // ② 유튜브 채널/영상
  if (isYouTube) {
    const { items, channelTitle } = await collectYouTube(targetUrl, html, limit, deep);
    if (items.length > 0) {
      // og:site_name이 늘 "YouTube"라서 채널명(피드 제목/ownerChannelName)을 우선한다.
      const bestName = sanitizeSiteName(channelTitle) || autoSiteName;
      return {
        ok: true,
        siteName: opts.siteName?.trim() || bestName,
        autoSiteName: bestName,
        url: targetUrl,
        strategy: "youtube",
        isVideo: true,
        items,
      };
    }
    return fail(
      targetUrl,
      "유튜브 채널의 최신 영상을 읽지 못했습니다.",
      "채널 홈 주소(예: https://www.youtube.com/@채널명)를 입력했는지 확인해 주세요."
    );
  }

  // ③ 선언된 RSS/Atom 자동 탐지
  const feedResult = await tryFeedCandidates(discoverFeedUrls(html, page.finalUrl || targetUrl), limit);
  if (feedResult) {
    const bestName = preferName(autoSiteName, feedResult.title, hostname);
    return {
      ok: true,
      siteName: opts.siteName?.trim() || bestName,
      autoSiteName: bestName,
      url: targetUrl,
      feedUrl: feedResult.feedUrl,
      strategy: "feed",
      isVideo: false,
      items: await enrich(feedResult.items, deep, limit),
    };
  }

  // ④ 마지막 수단 — HTML 목록에서 기사처럼 보이는 링크만 추린다.
  const htmlItems = collectFromHtmlList(html, page.finalUrl || targetUrl, limit);
  if (htmlItems.length > 0) {
    return {
      ok: true,
      siteName,
      autoSiteName,
      url: targetUrl,
      strategy: "html",
      isVideo: false,
      items: await enrich(htmlItems, deep, limit),
    };
  }

  return fail(
    targetUrl,
    "이 사이트에서 최신 글 목록을 찾지 못했습니다.",
    "RSS 주소(예: 주소 뒤에 /rss 또는 /feed)를 직접 입력하면 대부분 해결됩니다."
  );
}

function fail(url: string, reason: string, hint: string): CollectResult {
  return {
    ok: false,
    siteName: "",
    autoSiteName: "",
    url,
    strategy: "html",
    isVideo: false,
    items: [],
    reason,
    hint,
  };
}

function detectSiteName(html: string, hostname: string, isYouTube: boolean): string {
  const ogSite = sanitizeSiteName(
    extractMeta(html, ["og:site_name", "application-name", "twitter:site"])
  );
  if (ogSite) return ogSite;

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const raw = cleanText(titleMatch[1])
      .replace(/-\s*YouTube\s*$/i, "")
      .trim();
    if (isYouTube && sanitizeSiteName(raw)) return sanitizeSiteName(raw);
    const head = sanitizeSiteName(raw.split(/[-|｜·:]/)[0]);
    if (head.length >= 2) return head;
    const whole = sanitizeSiteName(raw);
    if (whole) return whole;
  }
  return hostname.replace(/^www\./, "");
}

/** og:site_name에 URL이 그대로 들어있는 사이트가 많아 이름으로 쓸 수 없는 값을 걸러낸다. */
function sanitizeSiteName(raw: string): string {
  const name = (raw || "").replace(/^@/, "").trim();
  if (!name) return "";
  if (/^https?:\/\//i.test(name) || /^www\./i.test(name)) return "";
  if (/^[a-z0-9.-]+\.(com|net|org|co\.kr|kr|io|me)\/?$/i.test(name)) return "";
  return name.length > 40 ? `${name.slice(0, 40).trim()}…` : name;
}

/** 후보 피드를 순서대로 두드려 첫 성공을 채택 (최대 4회, 각 5초) */
async function tryFeedCandidates(
  candidates: string[],
  limit: number
): Promise<{ feedUrl: string; items: RawItem[]; title: string } | null> {
  for (const candidate of candidates.slice(0, 4)) {
    const res = await fetchPage(candidate, 5000);
    if (!res.ok || !looksLikeFeed(res.text, res.contentType)) continue;
    const items = parseFeed(res.text, candidate).slice(0, limit);
    if (items.length >= 2) {
      return { feedUrl: candidate, items, title: sanitizeSiteName(extractFeedTitle(res.text)) };
    }
  }
  return null;
}

/** 호스트명밖에 못 건진 경우 피드 제목이 훨씬 나은 이름이다. */
function preferName(htmlName: string, feedName: string, hostname: string): string {
  const bare = hostname.replace(/^www\./, "");
  if (feedName && (!htmlName || htmlName === bare)) return feedName;
  return htmlName || feedName || bare;
}

function collectFromHtmlList(html: string, baseUrl: string, limit: number): CollectedItem[] {
  const origin = new URL(baseUrl).origin;
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const items: CollectedItem[] = [];

  let m: RegExpExecArray | null;
  while ((m = anchorRegex.exec(html)) !== null && items.length < limit * 2) {
    const title = cleanText(m[2]);
    if (title.length < 12 || title.length > 160) continue;
    if (isBoilerplateText(title) || seenTitle.has(title)) continue;
    // "서울경제 07월 28일 21:23" 같은 언론사 박스 링크는 기사 제목이 아니다.
    if (/\d{1,2}월\s*\d{1,2}일\s*\d{1,2}:\d{2}/.test(title)) continue;

    let href: string;
    try {
      href = new URL(m[1], baseUrl).href;
    } catch {
      continue;
    }
    if (seenUrl.has(href) || !looksLikeArticleLink(href, origin)) continue;

    seenUrl.add(href);
    seenTitle.add(title);
    items.push({ title, url: href, date: "최신", text: "", depth: "title" });
  }
  return items.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* 유튜브                                                              */
/* ------------------------------------------------------------------ */

async function collectYouTube(
  targetUrl: string,
  html: string,
  limit: number,
  deep: boolean
): Promise<{ items: CollectedItem[]; channelTitle: string }> {
  let channelTitle = "";

  // 단일 영상 주소면 그 영상만 처리
  const watchId = targetUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
  if (watchId) {
    const detail = parseYouTubeWatchPage(html);
    if (detail.title) {
      return {
        channelTitle: detail.channel,
        items: [
          {
            title: detail.title,
            url: `https://www.youtube.com/watch?v=${watchId}`,
            date: detail.date || "최신",
            text: detail.description,
            depth: detail.description.length > 120 ? "full" : "meta",
          },
        ],
      };
    }
  }

  const channelId =
    html.match(/["'](?:channelId|externalId)["']\s*:\s*["'](UC[a-zA-Z0-9_-]{20,})["']/i)?.[1] ||
    html.match(/itemprop=["']identifier["'][^>]*content=["'](UC[a-zA-Z0-9_-]{20,})["']/i)?.[1] ||
    html.match(/\/channel\/(UC[a-zA-Z0-9_-]{20,})/i)?.[1] ||
    targetUrl.match(/\/channel\/(UC[a-zA-Z0-9_-]{20,})/i)?.[1];

  const items: CollectedItem[] = [];

  if (channelId) {
    const rss = await fetchPage(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      6000
    );
    if (rss.ok) {
      channelTitle = extractFeedTitle(rss.text);
      for (const entry of parseFeed(rss.text, "https://www.youtube.com").slice(0, limit)) {
        // 설명 원문(줄 구조 포함)을 그대로 넘긴다 — 목차 추출은 요약 단계에서 한다.
        items.push({
          title: entry.title,
          url: entry.url,
          date: entry.date,
          text: entry.text,
          depth: cleanYoutubeDescription(entry.text).length > 120 ? "full" : "meta",
        });
      }
    }
  }

  // 피드가 없으면 페이지에 박힌 영상 ID로 폴백
  if (items.length === 0) {
    const ids = Array.from(html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)).map((x) => x[1]);
    for (const id of Array.from(new Set(ids)).slice(0, limit)) {
      items.push({
        title: "",
        url: `https://www.youtube.com/watch?v=${id}`,
        date: "최신",
        text: "",
        depth: "title",
      });
    }
  }

  if (!deep) return { items: items.filter((i) => i.title), channelTitle };

  // 설명이 짧은 영상은 시청 페이지에서 전체 설명(shortDescription)을 가져온다.
  const enriched = await Promise.all(
    items.map(async (item) => {
      if (item.title && item.text.length >= 200) return item;
      const res = await fetchPage(item.url, 7000);
      if (!res.ok) return item;
      const detail = parseYouTubeWatchPage(res.text);
      if (!channelTitle && detail.channel) channelTitle = detail.channel;
      return {
        title: item.title || detail.title,
        url: item.url,
        date: item.date !== "최신" ? item.date : detail.date || "최신",
        text: detail.description.length > item.text.length ? detail.description : item.text,
        depth: (detail.description.length > 120 ? "full" : item.depth) as ContentDepth,
      };
    })
  );

  return { items: enriched.filter((i) => i.title), channelTitle };
}

function parseYouTubeWatchPage(html: string): {
  title: string;
  description: string;
  date: string;
  channel: string;
} {
  const title =
    extractMeta(html, ["og:title", "twitter:title"]).replace(/\s*-\s*YouTube\s*$/i, "") ||
    cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(
      /\s*-\s*YouTube\s*$/i,
      ""
    );

  // shortDescription은 og:description(약 150자 잘림)과 달리 설명 전문을 담고 있다.
  const raw = readEmbeddedJsonString(html, "shortDescription");
  const description = raw || extractMeta(html, ["og:description", "description"]);

  const dateRaw =
    html.match(/"uploadDate"\s*:\s*"([^"]+)"/i)?.[1] ||
    extractMeta(html, ["datePublished", "uploadDate"]);

  const channel =
    readEmbeddedJsonString(html, "ownerChannelName") ||
    extractMeta(html, ["og:site_name"]).replace(/^YouTube$/i, "");

  return { title, description, date: dateRaw ? formatDate(dateRaw) : "", channel };
}

/** ytInitialPlayerResponse처럼 스크립트에 박힌 JSON 문자열 값을 이스케이프 해석까지 해서 꺼낸다. */
function readEmbeddedJsonString(html: string, key: string): string {
  const marker = `"${key}":"`;
  const start = html.indexOf(marker);
  if (start === -1) return "";
  let i = start + marker.length;
  let out = "";
  while (i < html.length && out.length < 12000) {
    const ch = html[i];
    if (ch === "\\") {
      out += html[i] + html[i + 1];
      i += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i += 1;
  }
  try {
    return JSON.parse(`"${out}"`) as string;
  } catch {
    return out.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
}

/* ------------------------------------------------------------------ */
/* 2차 딥 페치 — 본문이 얇은 항목만 원문에서 채운다                       */
/* ------------------------------------------------------------------ */

/** 수집 단계에서는 depth가 아직 정해지지 않을 수 있다 (enrich가 최종 판정). */
type RawItem = Omit<CollectedItem, "depth"> & { depth?: ContentDepth };

async function enrich(items: RawItem[], deep: boolean, limit: number): Promise<CollectedItem[]> {
  const sliced = items.slice(0, limit).map((i) => ({
    ...i,
    text: i.text || "",
    depth: (i.text && i.text.length >= DEEP_MIN_CHARS ? "full" : i.text ? "meta" : "title") as ContentDepth,
  }));

  if (!deep) return sliced;

  const results = await Promise.allSettled(
    sliced.map(async (item) => {
      if (item.text.length >= DEEP_MIN_CHARS) return item;
      const res = await fetchPage(item.url, 7000);
      if (!res.ok) return item;

      // 피드가 날짜를 주지 않은 경우 기사 페이지 메타에서 보충한다.
      const date =
        item.date === "최신" ? formatDate(extractPublishedDate(res.text)) : item.date;

      const extracted = extractArticleText(res.text);
      if (extracted.text.length <= item.text.length) return { ...item, date };
      return { ...item, date, text: extracted.text, depth: extracted.depth };
    })
  );

  return results.map((r, idx) => (r.status === "fulfilled" ? r.value : sliced[idx]));
}
