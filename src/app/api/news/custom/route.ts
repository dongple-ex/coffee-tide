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
    const userProvidedName = body.siteName?.trim() || "";

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
    const isNaverSports = /sports\.naver\.com|sports\.news\.naver\.com|m\.sports\.naver\.com/i.test(targetUrl);

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

    if (isNaverSports) {
      autoSiteName = "네이버 스포츠";
    } else if (ogSiteNameMatch) {
      autoSiteName = cleanText(ogSiteNameMatch[1]);
    } else if (titleTagMatch) {
      const rawTitle = cleanText(titleTagMatch[1]);
      autoSiteName = rawTitle.split(/[-|_:|]/)[0].trim().replace("- YouTube", "").trim() || hostname;
    } else {
      autoSiteName = hostname;
    }

    const finalSiteName = userProvidedName || autoSiteName;

    // 📺 A. 유튜브 파싱
    if (isYouTube) {
      const channelIdMatch =
        html.match(/["']channelId["']\s*:\s*["'](UC[a-zA-Z0-9_-]+)["']/i) ||
        html.match(/itemprop=["']channelId["']\s*content=["'](UC[a-zA-Z0-9_-]+)["']/i) ||
        html.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/i);

      if (channelIdMatch) {
        const channelId = channelIdMatch[1];
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

        try {
          const rssRes = await fetch(rssUrl, { next: { revalidate: 300 } });
          if (rssRes.ok) {
            const rssXml = await rssRes.text();
            const entryMatches = Array.from(rssXml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi));

            for (let i = 0; i < Math.min(entryMatches.length, 8); i++) {
              const entry = entryMatches[i][1];
              const tMatch = entry.match(/<title>([\s\S]*?)<\/title>/i);
              const lMatch = entry.match(/<link[^>]*href=["']([^"']+)["']/i);
              const dMatch = entry.match(/<media:description>([\s\S]*?)<\/media:description>/i);
              const dateMatch = entry.match(/<published>([\s\S]*?)<\/published>/i);

              const vTitle = tMatch ? cleanText(tMatch[1]) : "";
              const vLink = lMatch ? lMatch[1] : "";
              const vDesc = dMatch ? cleanText(dMatch[1]) : "";
              const vDate = dateMatch ? formatDate(dateMatch[1]) : "최신";

              if (vTitle && vLink) {
                rawArticles.push({
                  title: vTitle,
                  url: vLink,
                  date: vDate,
                  summary: vDesc,
                });
              }
            }
          }
        } catch (e) {
          console.error("[YouTube RSS Fetch Error]", e);
        }
      }

      if (rawArticles.length === 0) {
        const ytVideoMatches = Array.from(html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g));
        const seenVideoIds = new Set<string>();

        for (const m of ytVideoMatches) {
          const vId = m[1];
          if (seenVideoIds.has(vId) || rawArticles.length >= 6) continue;
          seenVideoIds.add(vId);

          const videoUrl = `https://www.youtube.com/watch?v=${vId}`;
          const details = await fetchYouTubeVideoDetails(videoUrl);

          if (details.title) {
            rawArticles.push({
              title: details.title,
              url: videoUrl,
              date: "최신",
              summary: details.summary,
            });
          }
        }
      }
    } else if (isNaverSports) {
      // ⚽ B. 네이버 스포츠 전용 정밀 딥 파서 (sports.news.naver.com 뉴스 섹션 지원)
      const parseSportsAnchors = (sourceHtml: string) => {
        const seenTitles = new Set<string>();
        const anchorRegex = /<a[^>]*href=["']([^"']*(?:\/read|\/news\/read|oid=)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let m;

        while ((m = anchorRegex.exec(sourceHtml)) !== null && rawArticles.length < 8) {
          let href = m[1];
          const innerText = cleanText(m[2]);

          if (
            innerText.length >= 6 &&
            !seenTitles.has(innerText) &&
            !isBoilerplateText(innerText)
          ) {
            seenTitles.add(innerText);
            if (href.startsWith("/")) href = new URL(href, origin).href;
            if (!href.startsWith("http")) continue;

            rawArticles.push({ title: innerText, url: href, date: "스포츠" });
          }
        }
      };

      parseSportsAnchors(html);

      // 네이버 스포츠 메인페이지 수집 기사가 부족할 경우, 스포츠 뉴스 전용 파이프라인 추가 Fetch
      if (rawArticles.length < 3) {
        try {
          const sportsNewsRes = await fetch("https://sports.news.naver.com/index", {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            },
            next: { revalidate: 180 },
          });
          if (sportsNewsRes.ok) {
            const sportsNewsHtml = await sportsNewsRes.text();
            parseSportsAnchors(sportsNewsHtml);
          }
        } catch {}
      }
    } else {
      // C. 일반 RSS/Atom 피드 파싱
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

      // D. RSS가 없는 일반 HTML 웹페이지 파싱
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

    // 🚀 핵심: 2차 실시간 딥 크롤링 수행하여 본문 3줄 알짜배기 요약 렌더링
    const finalArticles: CustomNewsItem[] = await Promise.all(
      rawArticles.map(async (art, idx) => {
        let rawFullText = art.summary || "";

        if (isWeakSummary(art.title, rawFullText)) {
          try {
            if (isYouTube) {
              const details = await fetchYouTubeVideoDetails(art.url);
              if (details.summary) rawFullText = details.summary;
            } else {
              const deepContent = await fetchArticleFullText(art.url);
              if (deepContent && deepContent.length > 20) {
                rawFullText = deepContent;
              }
            }
          } catch {}
        }

        const summarizedText = isYouTube
          ? formatYouTubeSummary(art.title, rawFullText)
          : extractRichKeySummary(art.title, rawFullText);

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
 * 요약 텍스트 부실 여부 판별기
 */
function isWeakSummary(title: string, summary: string): boolean {
  if (!summary || summary.trim().length < 40) return true;
  const cleanTitle = title.replace(/[^a-zA-Z0-9가-힣]/g, "");
  const cleanSummary = summary.replace(/[^a-zA-Z0-9가-힣]/g, "");

  if (cleanSummary.includes(cleanTitle) && cleanSummary.length < cleanTitle.length + 30) {
    return true;
  }
  if (summary.includes("동영상 세션입니다") || summary.includes("주요 영상 세션")) {
    return true;
  }
  return false;
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
 * 📜 원문 클릭 없이 핵심 알짜배기 내용을 전달하는 3줄 줄글 파서
 */
function extractRichKeySummary(title: string, fullText: string): string {
  if (!fullText || fullText.length < 30) {
    return `${title}에 관한 실시간 핵심 아티클 소식입니다. 기사 원문을 직접 방문하지 않고도 핵심 이슈를 한눈에 파악하실 수 있습니다.`;
  }

  const sentences = fullText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => cleanText(s))
    .filter((s) => s.length > 15 && !isBoilerplateText(s));

  if (sentences.length === 0) {
    return `${title}에 관한 주요 보도 내용입니다. 기사의 구체적인 사실 관계와 핵심 세부사항을 제공합니다.`;
  }

  const keySentences = sentences.filter((s) =>
    /[0-9%원달러억조pt포인트]/i.test(s) || /급락|상승|하락|발표|공개|허용|결정|원인|영향|전망|밝혔다|전망이다|승리|골|결과|경기/i.test(s)
  );

  const finalSentences = keySentences.length >= 2 ? keySentences.slice(0, 3) : sentences.slice(0, 3);
  return finalSentences.join(" ");
}

/**
 * 📺 유튜브 영상 설명 알짜배기 요약 파서
 */
function formatYouTubeSummary(title: string, description: string): string {
  if (!description || description.length < 20) {
    return `${title} 방송 세션입니다. 주요 토크 주제와 핵심 영상 내용을 빠르게 시청하실 수 있도록 원본 영상을 제공합니다.`;
  }

  const cleanedDesc = description
    .split("\n")
    .map((l) => cleanText(l))
    .filter((l) => l.length > 15 && !l.includes("http") && !l.includes("구독"))
    .slice(0, 2)
    .join(" ");

  return `${cleanedDesc || description.slice(0, 150)}`;
}

/**
 * 개별 유튜브 동영상 주소 딥 Fetch
 */
async function fetchYouTubeVideoDetails(videoUrl: string): Promise<{ title: string; summary: string }> {
  try {
    const res = await fetch(videoUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) return { title: "", summary: "" };
    const html = await res.text();

    const ogTitleMatch =
      html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    const ogDescMatch =
      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);

    const title = ogTitleMatch ? cleanText(ogTitleMatch[1]).replace("- YouTube", "").trim() : "";
    const desc = ogDescMatch ? cleanText(ogDescMatch[1]) : "";

    return { title, summary: desc };
  } catch {
    return { title: "", summary: "" };
  }
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

    // 네이버 스포츠 및 언론사 기사 본문 영역 핀포인트 수집
    const bodyContainerMatch =
      html.match(/<div[^>]*id=["']newsct_article["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*class=["'][^"']*newsct_article[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*id=["']articeBody["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*id=["']newsEndContents["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*id=["']sports_news_article["'][^>]*>([\s\S]*?)<\/div>/i) ||
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
      title: `${siteName} 실시간 최신 소식 및 아티클`,
      summary: `${siteName}의 실시간 소식 및 아티클 원문 내용입니다. 원문 읽기 링크를 통해 전체 콘텐츠를 바로 확인하실 수 있습니다.`,
      date: "실시간",
      url: url || "#",
    },
  ];
}
