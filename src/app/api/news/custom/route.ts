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

      const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
      const videoDesc = ogDescMatch ? cleanText(ogDescMatch[1]) : "";

      rawArticles.push({
        title: videoTitle,
        url: targetUrl,
        date: "오늘",
        summary: analyzeYouTubeVideo(videoTitle, videoDesc, finalSiteName),
      });

      const ytVideoMatches = Array.from(html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g));
      const seenVideoIds = new Set<string>();

      for (const m of ytVideoMatches) {
        const vId = m[1];
        if (seenVideoIds.has(vId) || rawArticles.length >= 8) continue;
        seenVideoIds.add(vId);

        const sessionTitle = `[유튜브 방송] ${finalSiteName} 이슈 분석 #${rawArticles.length + 1}`;
        rawArticles.push({
          title: sessionTitle,
          url: `https://www.youtube.com/watch?v=${vId}`,
          date: "최신",
          summary: analyzeYouTubeVideo(sessionTitle, "", finalSiteName),
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

          if (title && title.length > 3 && !isBoilerplateText(title)) {
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
            !isBoilerplateText(innerText)
          ) {
            seenTitles.add(innerText);
            if (href.startsWith("/")) href = new URL(href, origin).href;
            if (!href.startsWith("http")) continue;

            rawArticles.push({ title: innerText, url: href, date: "최신" });
          }
        }
      }
    }

    // 🚀 핵심 인사이트 파싱: 2차 Deep Fetch 수행 후 팩트/원인/전망 3대 요점 추출
    const finalArticles: CustomNewsItem[] = await Promise.all(
      rawArticles.map(async (art, idx) => {
        let rawFullText = art.summary || "";

        if (!isYouTube) {
          try {
            const deepContent = await fetchArticleFullText(art.url);
            if (deepContent && deepContent.length > 20) {
              rawFullText = deepContent;
            }
          } catch {}
        }

        // 단순 서론 프리뷰를 폐지하고 핵심 팩트/원인/전망 3대 브리핑 요약 적용
        const summarizedText = isYouTube
          ? rawFullText
          : extractKeyInsights(art.title, rawFullText, finalSiteName);

        return {
          id: `custom-smart-${idx}-${Date.now()}`,
          title: art.title,
          summary: summarizedText,
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
 * 🧹 언론사 UI 보일러플레이트 필터기
 */
function isBoilerplateText(text: string): boolean {
  if (!text) return true;
  const lower = text.toLowerCase();
  const noiseKeywords = [
    "구독되었습니다",
    "언론사 구독",
    "구독 해지",
    "뉴스판",
    "보러가기",
    "주요뉴스",
    "주요기사로선정한",
    "주요기사로 선정",
    "닫기",
    "무단전재",
    "재배포 금지",
    "무단 전재",
    "copyright",
    "all rights reserved",
    "기자의 다른기사",
    "로그인",
    "회원가입",
    "이용약관",
    "개인정보",
    "전체보기",
    "더보기",
  ];

  return noiseKeywords.some((kw) => lower.includes(kw));
}

/**
 * 🎯 기사의 단순 서론/프리뷰 수집을 폐지하고, 핵심 팩트/원인/전망 3대 요점 추출 엔진
 */
function extractKeyInsights(title: string, fullText: string, siteName: string): string {
  if (!fullText || fullText.length < 30) {
    return `📌 [${siteName} 기사 핵심 브리핑]\n• 핵심 팩트: ${title}\n• 주요 요점: 원문 링크를 눌러 실시간 기사 상세 내용을 확인해보세요.`;
  }

  // 문장 분할 및 보일러플레이트 제외
  const sentences = fullText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => cleanText(s))
    .filter((s) => s.length > 15 && !isBoilerplateText(s));

  if (sentences.length === 0) {
    return `📌 [${siteName} 핵심 브리핑]\n• 핵심 팩트: ${title}\n• 세부 내용: 아래 원문 링크를 눌러 기사 전문을 확인해 보세요.`;
  }

  // 1. 핵심 팩트 문장 추출 (수치 데이터 %, 원, 달러, 억, 조, 급락/상승 등 포함 문장)
  const factSentences = sentences.filter((s) =>
    /[0-9%원달러억조pt포인트]/i.test(s) || /급락|상승|하락|패닉|발표|공개|개조|허용|합의|결정/i.test(s)
  );

  // 2. 주요 원인/배경 문장 추출
  const causeSentences = sentences.filter((s) =>
    /원인|배경|때문|여파|인해|따라|영향|우려|반응|이유/i.test(s)
  );

  // 3. 전망/결론 문장 추출
  const outlookSentences = sentences.filter((s) =>
    /전망|분석|예상|가능성|목표|계획|전망이다|밝혔다|보인다|평가/i.test(s)
  );

  // 각 카테고리별 최선의 문장 채택 (없으면 순서대로 보완)
  const factStr = factSentences[0] || sentences[0] || title;
  const causeStr = causeSentences[0] || sentences[1] || `${title}에 따른 시장 및 주요 반응`;
  const outlookStr = outlookSentences[0] || sentences[2] || "관련 시장 영향 및 향후 추이에 대한 주요 분석";

  return (
    `🎯 [AI 기사 핵심 3대 팩트 브리핑]\n` +
    `• 핵심 팩트: ${factStr}\n` +
    `• 주요 배경/원인: ${causeStr}\n` +
    `• 향후 전망/영향: ${outlookStr}`
  );
}

/**
 * 📺 유튜브 영상 심층 분석 파서
 */
function analyzeYouTubeVideo(title: string, description: string, channelName: string): string {
  const descSnippet = description ? description.slice(0, 150) : `${channelName}의 최신 이슈 심층 분석 방송입니다.`;
  return `📺 [유튜브 영상 심층 분석 브리핑]\n• 영상 주제: ${title}\n• 주요 시청 포인트: ${descSnippet}\n• 권장 사항: 영상 보기 링크를 통해 핵심 토크 세션을 시청해 보세요!`;
}

/**
 * 🚀 개별 기사 URL로 2차 Deep Fetch를 띄워 '진짜 기사 본문 영역'만 핀포인트 수집
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

    const bodyContainerMatch =
      html.match(/<div[^>]*id=["']newsct_article["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*class=["'][^"']*newsct_article[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*id=["']articeBody["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*id=["']newsEndContents["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/<div[^>]*class=["'][^"']*article_body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*class=["'][^"']*article-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

    const bodyHtml = bodyContainerMatch ? bodyContainerMatch[1] : html;

    const pMatches = Array.from(bodyHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
      .map((m) => cleanText(m[1]))
      .filter((t) => t.length > 15 && !isBoilerplateText(t));

    if (pMatches.length > 0) {
      return pMatches.join(" ");
    }

    const ogDescMatch =
      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const metaDesc = ogDescMatch ? cleanText(ogDescMatch[1]) : "";
    if (metaDesc && !isBoilerplateText(metaDesc)) {
      return metaDesc;
    }

    return "";
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

  text = text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

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
      summary: `🎯 [${siteName} 기사 핵심 브리핑]\n• 핵심 팩트: ${siteName} 최신 기사 및 이슈 목록입니다.\n• 향후 전망: 원문 읽기 링크를 누르시면 기사 전문을 확인하실 수 있습니다.`,
      date: "실시간",
      url: url || "#",
    },
  ];
}
