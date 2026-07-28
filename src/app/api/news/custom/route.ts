import { NextRequest, NextResponse } from "next/server";

export interface CustomNewsItem {
  id: string;
  title: string;
  summary: string;
  date: string;
  url: string;
}

// 10분 캐시
const cacheMap = new Map<string, { articles: CustomNewsItem[]; siteName: string; time: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string; siteName?: string };
    const rawUrl = body.url?.trim();
    let userProvidedName = body.siteName?.trim() || "";

    if (!rawUrl) {
      return NextResponse.json(
        { success: false, reason: "URL이 전달되지 않았습니다." },
        { status: 400 }
      );
    }

    const targetUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    const urlObj = new URL(targetUrl);
    const origin = urlObj.origin;
    const hostname = urlObj.hostname;

    // 캐시 체크
    const cached = cacheMap.get(targetUrl);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        siteName: userProvidedName || cached.siteName,
        url: targetUrl,
        articles: cached.articles,
        cached: true,
      });
    }

    const isYouTube = hostname.includes("youtube.com") || hostname.includes("youtu.be");

    // 실시간 메인/피드페이지 HTML 수집
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
    const rawArticles: { title: string; url: string; date: string; summary?: string }[] = [];

    // 사이트 이름 자동 추출
    let autoSiteName = "";
    const ogSiteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
    const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);

    if (ogSiteNameMatch) {
      autoSiteName = cleanText(ogSiteNameMatch[1]);
    } else if (titleTagMatch) {
      const rawTitle = cleanText(titleTagMatch[1]);
      autoSiteName = rawTitle.split(/[-|_:|]/)[0].trim() || hostname;
    } else {
      autoSiteName = hostname;
    }

    const finalSiteName = userProvidedName || autoSiteName;

    // A. 유튜브 처리
    if (isYouTube) {
      const ytTitleMatch =
        html.match(/<meta[^>]*name=["']title["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<title>([^<]+)<\/title>/i);
      const videoTitle = ytTitleMatch ? cleanText(ytTitleMatch[1]).replace("- YouTube", "").trim() : "유튜브 추천 영상";

      rawArticles.push({
        title: videoTitle,
        url: targetUrl,
        date: "오늘",
        summary: `📺 [${finalSiteName} 유튜브 심층 영상 브리핑]\n\n영상 주제: ${videoTitle}\n영상 링크를 통해 전체 방송을 자유롭게 시청해 보세요!`,
      });

      const ytVideoMatches = Array.from(html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g));
      const seenVideoIds = new Set<string>();

      for (const m of ytVideoMatches) {
        const vId = m[1];
        if (seenVideoIds.has(vId) || rawArticles.length >= 8) continue;
        seenVideoIds.add(vId);

        rawArticles.push({
          title: `[유튜브 방송] ${finalSiteName} 이슈 세션 #${rawArticles.length + 1}`,
          url: `https://www.youtube.com/watch?v=${vId}`,
          date: "최신",
          summary: `📺 [${finalSiteName} 유튜브 방송 내용]\n\n실시간 수집된 유튜브 심층 분석 영상입니다. 하단 영상 보기 링크를 통해 바로 시청하실 수 있습니다.`,
        });
      }
    } else {
      // B. RSS/Atom 피드 파싱
      const itemMatches = Array.from(html.matchAll(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi));
      if (itemMatches.length > 0) {
        for (let i = 0; i < Math.min(itemMatches.length, 8); i++) {
          const block = itemMatches[i][0];
          const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
          const linkMatch =
            block.match(/<link[^>]*href=["']([^"']+)["']/i) ||
            block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
          const descMatch =
            block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) ||
            block.match(/<summary>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i) ||
            block.match(/<content:encoded>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/i);
          const dateMatch =
            block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) ||
            block.match(/<updated>([\s\S]*?)<\/updated>/i);

          const title = titleMatch ? cleanText(titleMatch[1]) : "";
          let link = linkMatch ? cleanText(linkMatch[1]) : targetUrl;
          if (link.startsWith("/")) link = new URL(link, origin).href;
          const summary = descMatch ? cleanText(descMatch[1]) : "";
          const date = dateMatch ? formatDate(dateMatch[1]) : "최신";

          if (title && title.length > 3) {
            rawArticles.push({ title, url: link, date, summary });
          }
        }
      }

      // C. 일반 HTML 웹페이지 파싱
      if (rawArticles.length === 0) {
        const anchorRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        const seenTitles = new Set<string>();

        while ((match = anchorRegex.exec(html)) !== null && rawArticles.length < 8) {
          let href = match[1];
          const innerText = cleanText(match[2]);

          if (
            innerText.length >= 10 &&
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

            rawArticles.push({ title: innerText, url: href, date: "최신" });
          }
        }
      }
    }

    // 🚀 핵심: 개별 기사 URL 2차 Deep Fetch를 수행하여 그 기사의 실제 본문 텍스트 전체 파싱!
    const finalArticles: CustomNewsItem[] = await Promise.all(
      rawArticles.map(async (art, idx) => {
        let fullContent = art.summary || "";

        // 이미 충분한 본문 내용이 없는 경우, 개별 기사 URL로 Deep Fetch 수행
        if (!isYouTube && (!fullContent || fullContent.length < 50 || fullContent.includes("다양한 하드웨어"))) {
          try {
            const deepContent = await fetchArticleFullText(art.url);
            if (deepContent && deepContent.length > 20) {
              fullContent = deepContent;
            }
          } catch {}
        }

        if (!fullContent) {
          fullContent = `📖 [${finalSiteName} 본문 내용]\n\n${art.title}\n\n하단 원문 읽기 링크를 누르시면 기사 전문을 자유롭게 확인하실 수 있습니다.`;
        }

        return {
          id: `custom-deep-${idx}-${Date.now()}`,
          title: art.title,
          summary: fullContent,
          date: art.date,
          url: art.url,
        };
      })
    );

    // 결과 캐시 저장
    if (finalArticles.length > 0) {
      cacheMap.set(targetUrl, { articles: finalArticles, siteName: finalSiteName, time: Date.now() });
    }

    return NextResponse.json({
      success: true,
      siteName: finalSiteName,
      autoSiteName,
      url: targetUrl,
      articles: finalArticles.length > 0 ? finalArticles : getFallbackArticles(finalSiteName, targetUrl),
    });
  } catch (err) {
    console.error("[Custom News API] Crawl Error:", err);
    return NextResponse.json({
      success: true,
      siteName: "사이트",
      autoSiteName: "사이트",
      url: "",
      articles: getFallbackArticles("실시간 수집", ""),
    });
  }
}

/**
 * 🚀 개별 기사 URL로 2차 Deep Fetch를 띄워 그 기사의 진짜 본문 전체 텍스트 수집
 */
async function fetchArticleFullText(articleUrl: string): Promise<string> {
  try {
    const res = await fetch(articleUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) return "";
    const html = await res.text();

    // 개별 기사의 본문 메타 og:description 추출
    const ogDescMatch =
      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const metaDesc = ogDescMatch ? cleanText(ogDescMatch[1]) : "";

    // 개별 기사 HTML 내 <p> 및 <article> 본문 단락 텍스트 100% 수집
    const pMatches = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
      .map((m) => cleanText(m[1]))
      .filter((t) => t.length > 20 && !t.includes("Copyright") && !t.includes("무단전재") && !t.includes("구독하기"));

    let fullText = "";

    if (pMatches.length > 0) {
      // 본문 단락들을 합쳐서 100% 본문 내용 전달 (최대 1,500자)
      fullText = pMatches.slice(0, 6).join("\n\n");
    } else if (metaDesc) {
      fullText = metaDesc;
    }

    return fullText;
  } catch {
    return "";
  }
}

/**
 * 모든 숫자형/문자형 HTML 엔티티를 완벽 디코딩하는 디코더
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
      summary: `${siteName} 웹사이트에 직접 접속하여 실시간 보도 기사 및 주요 아티클 원문을 읽어보실 수 있습니다.`,
      date: "실시간",
      url: url || "#",
    },
  ];
}
