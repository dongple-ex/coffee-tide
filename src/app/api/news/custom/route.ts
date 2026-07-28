import { NextRequest, NextResponse } from "next/server";

export interface CustomNewsItem {
  id: string;
  title: string;
  summary: string;
  date: string;
  url: string;
}

// 15분 캐시
const cacheMap = new Map<string, { articles: CustomNewsItem[]; time: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string; siteName?: string };
    const rawUrl = body.url?.trim();
    const siteName = body.siteName?.trim() || "등록된 사이트";

    if (!rawUrl) {
      return NextResponse.json(
        { success: false, reason: "URL이 전달되지 않았습니다." },
        { status: 400 }
      );
    }

    const targetUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    const urlObj = new URL(targetUrl);
    const origin = urlObj.origin;

    // 캐시 체크
    const cached = cacheMap.get(targetUrl);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        siteName,
        url: targetUrl,
        articles: cached.articles,
        cached: true,
      });
    }

    // 실시간 웹페이지 HTML/RSS 수집
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();
    const articles: CustomNewsItem[] = [];

    // 1. RSS/XML 피드인 경우 (<item> 또는 <entry>)
    const itemMatches = Array.from(html.matchAll(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi));
    if (itemMatches.length > 0) {
      for (let i = 0; i < Math.min(itemMatches.length, 6); i++) {
        const block = itemMatches[i][0];
        const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const linkMatch =
          block.match(/<link[^>]*href=["']([^"']+)["']/i) ||
          block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
        const descMatch =
          block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) ||
          block.match(/<summary>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i);
        const dateMatch =
          block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) ||
          block.match(/<updated>([\s\S]*?)<\/updated>/i);

        const title = titleMatch ? cleanText(titleMatch[1]) : "";
        let link = linkMatch ? cleanText(linkMatch[1]) : targetUrl;
        if (link.startsWith("/")) link = new URL(link, origin).href;
        const summary = descMatch ? cleanText(descMatch[1]).slice(0, 150) + "..." : title;
        const date = dateMatch ? formatDate(dateMatch[1]) : "최신";

        if (title && title.length > 3) {
          articles.push({
            id: `rss-${i}-${Date.now()}`,
            title,
            summary: summary || title,
            date,
            url: link,
          });
        }
      }
    }

    // 2. HTML 일반 웹페이지인 경우 (OpenGraph 메타 태그 및 기사 앵커 태그 추출)
    if (articles.length === 0) {
      // 2-1. OG 메타데이터 대표 기사
      const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
      const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
      const ogUrlMatch = html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i);
      const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);

      if (ogTitleMatch || titleTagMatch) {
        const pageTitle = cleanText(ogTitleMatch ? ogTitleMatch[1] : titleTagMatch![1]);
        const pageDesc = ogDescMatch ? cleanText(ogDescMatch[1]) : `${siteName}의 최신 소식을 확인하세요.`;
        let pageUrl = ogUrlMatch ? ogUrlMatch[1] : targetUrl;
        if (pageUrl.startsWith("/")) pageUrl = new URL(pageUrl, origin).href;

        articles.push({
          id: `html-main-${Date.now()}`,
          title: pageTitle,
          summary: pageDesc,
          date: "실시간",
          url: pageUrl,
        });
      }

      // 2-2. 기사/포스트 앵커 태그 (<a>) 실기사 추출
      const anchorRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      const seenTitles = new Set<string>();

      while ((match = anchorRegex.exec(html)) !== null && articles.length < 6) {
        let href = match[1];
        const innerText = cleanText(match[2]);

        // 의미 있는 기사 제목 조건 (12자 이상, 특수 태그 제거)
        if (
          innerText.length >= 12 &&
          !seenTitles.has(innerText) &&
          !innerText.includes("로그인") &&
          !innerText.includes("회원가입") &&
          !innerText.includes("이용약관") &&
          !innerText.includes("개인정보") &&
          !innerText.includes("메뉴")
        ) {
          seenTitles.add(innerText);
          if (href.startsWith("/")) href = new URL(href, origin).href;
          if (!href.startsWith("http")) continue;

          articles.push({
            id: `html-article-${articles.length}-${Date.now()}`,
            title: innerText,
            summary: `${siteName} 실시간 원문 기사: ${innerText}`,
            date: "최신",
            url: href,
          });
        }
      }
    }

    // 결과 저장
    if (articles.length > 0) {
      cacheMap.set(targetUrl, { articles, time: Date.now() });
    }

    return NextResponse.json({
      success: true,
      siteName,
      url: targetUrl,
      articles: articles.length > 0 ? articles : getFallbackArticles(siteName, targetUrl),
    });
  } catch (err) {
    console.error("[Custom News API] Crawl Error:", err);
    return NextResponse.json(
      {
        success: true,
        siteName: "사이트",
        url: "",
        articles: getFallbackArticles("실시간 수집", ""),
      }
    );
  }
}

function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(rawDate: string): string {
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      const month = d.getMonth() + 1;
      const day = d.getDate();
      return `${month}.${day}`;
    }
  } catch {}
  return "최신";
}

function getFallbackArticles(siteName: string, url: string): CustomNewsItem[] {
  return [
    {
      id: `fallback-1-${Date.now()}`,
      title: `${siteName} 실시간 소식 및 최신 아티클`,
      summary: `${siteName} 웹사이트에 직접 접속하여 실시간 이슈와 아티클 원문을 바로 읽어보실 수 있습니다.`,
      date: "실시간",
      url: url || "#",
    },
  ];
}
