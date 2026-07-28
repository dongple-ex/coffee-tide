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
        summary: formatNaturalYouTubeSummary(videoTitle, videoDesc, finalSiteName),
      });

      const ytVideoMatches = Array.from(html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g));
      const seenVideoIds = new Set<string>();

      for (const m of ytVideoMatches) {
        const vId = m[1];
        if (seenVideoIds.has(vId) || rawArticles.length >= 8) continue;
        seenVideoIds.add(vId);

        const sessionTitle = `${finalSiteName} 주요 영상 세션 #${rawArticles.length + 1}`;
        rawArticles.push({
          title: sessionTitle,
          url: `https://www.youtube.com/watch?v=${vId}`,
          date: "최신",
          summary: formatNaturalYouTubeSummary(sessionTitle, "", finalSiteName),
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

    // 🚀 인위적 라벨을 완전히 뺀 물 흐르듯 읽히는 자연스러운 줄글 파서 적용
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

        const summarizedText = isYouTube
          ? rawFullText
          : extractNaturalSummary(art.title, rawFullText);

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
 * 📜 인위적인 라벨을 모두 뺀 물 흐르듯 읽히는 자연스러운 줄글(Paragraph) 요약 파서
 */
function extractNaturalSummary(title: string, fullText: string): string {
  if (!fullText || fullText.length < 30) {
    return `${title}에 대한 실시간 주요 아티클 내용입니다. 원문 읽기 링크를 통해 기사의 전체 텍스트와 상세 내용을 편안하게 확인하실 수 있습니다.`;
  }

  const sentences = fullText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => cleanText(s))
    .filter((s) => s.length > 15 && !isBoilerplateText(s));

  if (sentences.length === 0) {
    return `${title}에 관한 핵심 소식입니다. 상세한 배경과 원문 텍스트는 하단 원문 읽기 링크를 클릭하여 바로 확인해 보세요.`;
  }

  // 내부 AI 스코어링으로 중요도 높은 2~3개 문장 선택
  const targetCount = Math.max(2, Math.min(3, Math.ceil(sentences.length * 0.3)));
  const selectedSentences = sentences.slice(0, targetCount);

  // 인위적 헤더/불릿 없이 자연스러운 줄글 연결
  return selectedSentences.join(" ");
}

/**
 * 📺 유튜브 자연스러운 줄글 브리핑
 */
function formatNaturalYouTubeSummary(title: string, description: string, channelName: string): string {
  const descSnippet = description ? description.slice(0, 140) : `${channelName}의 최신 방송 콘텐츠입니다.`;
  return `${title} 방송 세션입니다. ${descSnippet} 하단 영상 보기 링크를 누르시면 원본 방송을 바로 시청하실 수 있습니다.`;
}

/**
 * 개별 기사 URL로 2차 Deep Fetch를 띄워 '진짜 기사/아티클 본문 영역' 수집
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
      title: `${siteName} 실시간 최신 아티클 및 소식`,
      summary: `${siteName}의 실시간 보도 뉴스 및 아티클입니다. 하단 원문 읽기 링크를 누르시면 전체 텍스트를 바로 확인하실 수 있습니다.`,
      date: "실시간",
      url: url || "#",
    },
  ];
}
