import { NextRequest, NextResponse } from "next/server";

export interface CustomNewsItem {
  id: string;
  title: string;
  summary: string;
  date: string;
  url: string;
}

// 10분 캐시
const cacheMap = new Map<string, { articles: CustomNewsItem[]; time: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      next: { revalidate: 180 },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();
    const articles: CustomNewsItem[] = [];

    // 공통 사이트 메타 디스크립션 추출
    const ogDescMatch =
      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const siteMetaDesc = ogDescMatch ? cleanText(ogDescMatch[1]) : "";

    // 1. RSS/XML 피드 파싱 (<item> 또는 <entry>)
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
        
        let summary = descMatch ? cleanText(descMatch[1]) : "";
        if (!summary || summary === title) {
          summary = siteMetaDesc || "실시간 기사 본문 주요 내용 및 이슈 개요입니다. 아래 링크로 원문 전체를 읽어보세요.";
        } else if (summary.length > 180) {
          summary = summary.slice(0, 180) + "...";
        }

        const date = dateMatch ? formatDate(dateMatch[1]) : "최신";

        if (title && title.length > 3) {
          articles.push({
            id: `rss-${i}-${Date.now()}`,
            title,
            summary,
            date,
            url: link,
          });
        }
      }
    }

    // 2. HTML 일반 웹페이지 파싱 (OpenGraph 및 앵커 태그 추출)
    if (articles.length === 0) {
      // 2-1. 대표 OG 기사
      const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
      const ogUrlMatch = html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i);
      const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);

      if (ogTitleMatch || titleTagMatch) {
        const pageTitle = cleanText(ogTitleMatch ? ogTitleMatch[1] : titleTagMatch![1]);
        let pageUrl = ogUrlMatch ? ogUrlMatch[1] : targetUrl;
        if (pageUrl.startsWith("/")) pageUrl = new URL(pageUrl, origin).href;

        articles.push({
          id: `html-main-${Date.now()}`,
          title: pageTitle,
          summary: siteMetaDesc || `${siteName}의 실시간 대표 이슈 및 공식 기사입니다.`,
          date: "실시간",
          url: pageUrl,
        });
      }

      // 2-2. 기사/포스트 앵커 태그 (<a>) 추출 및 개별 기사 요약 매핑
      const anchorRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      const seenTitles = new Set<string>();

      while ((match = anchorRegex.exec(html)) !== null && articles.length < 6) {
        let href = match[1];
        const innerText = cleanText(match[2]);

        // 의미 있는 기사 제목 조건 (12자 이상, 주요 메뉴 링크 제외)
        if (
          innerText.length >= 12 &&
          !seenTitles.has(innerText) &&
          !innerText.includes("로그인") &&
          !innerText.includes("회원가입") &&
          !innerText.includes("이용약관") &&
          !innerText.includes("개인정보") &&
          !innerText.includes("전체보기") &&
          !innerText.includes("더보기")
        ) {
          seenTitles.add(innerText);
          if (href.startsWith("/")) href = new URL(href, origin).href;
          if (!href.startsWith("http")) continue;

          // 요약 생성 (제목 반복을 피하고 유용한 원문 안내 텍스트로 구성)
          const articleSummary = siteMetaDesc
            ? `[기사 개요] ${siteMetaDesc}`
            : `💡 ${siteName}의 실시간 보도 기사입니다. 아래 원문 읽기 링크를 누르시면 전체 기사를 바로 확인하실 수 있습니다.`;

          articles.push({
            id: `html-article-${articles.length}-${Date.now()}`,
            title: innerText,
            summary: articleSummary,
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
    return NextResponse.json({
      success: true,
      siteName: "사이트",
      url: "",
      articles: getFallbackArticles("실시간 수집", ""),
    });
  }
}

/**
 * 모든 숫자형/문자형 HTML 엔티티를 완전 디코딩하는 강화된 디코더
 */
function cleanText(raw: string): string {
  if (!raw) return "";
  let text = raw.replace(/<[^>]*>/g, "");

  // 10진수 숫자 엔티티 (&#034; -> ", &#39; -> ' 등)
  text = text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
  // 16진수 숫자 엔티티 (&#x22; -> ", &#x27; -> ' 등)
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // 주요 문자 엔티티 치환
  text = text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#034;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&copy;/g, "©")
    .replace(/&reg;/g, "®");

  return text.replace(/\s+/g, " ").trim();
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
      title: `${siteName} 실시간 최신 기사 및 이슈 목록`,
      summary: `${siteName} 웹사이트에 직접 접속하여 최신 보도 기사 및 주요 아티클 원문을 읽어보실 수 있습니다.`,
      date: "실시간",
      url: url || "#",
    },
  ];
}
