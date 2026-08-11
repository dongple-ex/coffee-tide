import { NextRequest, NextResponse } from "next/server";
import { YouTubeVideo, YouTubeBundleApiResponse } from "@/lib/types/youtube";
import { DEFAULT_YOUTUBE_BUNDLES } from "@/lib/youtube/presets";
import { summarizeSiteContent } from "@/lib/ai/gemini";

// 서버 메모리 캐시 (10분)
const bundleCache = new Map<string, { data: YouTubeBundleApiResponse; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .trim();
}

function parseYoutubeVideosFromHtml(html: string, fallbackChannel: string): YouTubeVideo[] {
  const videos: YouTubeVideo[] = [];
  const startIdx = html.indexOf("ytInitialData = ");
  if (startIdx === -1) return videos;

  const scriptEnd = html.indexOf(";</script>", startIdx);
  const jsonText = html.substring(startIdx + "ytInitialData = ".length, scriptEnd !== -1 ? scriptEnd : undefined);

  let root: unknown;
  try {
    root = JSON.parse(jsonText);
  } catch {
    return videos;
  }

  // 재귀적으로 lockupViewModel 또는 videoRenderer 탐색
  function walk(node: unknown) {
    if (!node || typeof node !== "object" || videos.length >= 8) return;

    // 1. 최신 YouTube Lockup UI
    const lvm = (node as Record<string, any>).lockupViewModel;
    if (lvm) {
      const videoId = lvm.contentId;
      const title =
        lvm.metadata?.lockupMetadataViewModel?.title?.content ||
        lvm.rendererContext?.accessibilityContext?.label ||
        "";
      if (videoId && typeof videoId === "string" && title && !videos.some((v) => v.id === videoId)) {
        videos.push({
          id: videoId,
          title: cleanText(title),
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          publishedAt: "최신",
          channelTitle: fallbackChannel,
          channelId: "",
        });
      }
    }

    // 2. 클래식 videoRenderer
    const vr = (node as Record<string, any>).videoRenderer;
    if (vr) {
      const videoId = vr.videoId;
      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || "";
      const published = vr.publishedTimeText?.simpleText || "최신";
      const channel = vr.ownerText?.runs?.[0]?.text || fallbackChannel;
      if (videoId && typeof videoId === "string" && title && !videos.some((v) => v.id === videoId)) {
        videos.push({
          id: videoId,
          title: cleanText(title),
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          publishedAt: published,
          channelTitle: cleanText(channel),
          channelId: "",
        });
      }
    }

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else {
      for (const key of Object.keys(node as Record<string, unknown>)) {
        walk((node as Record<string, unknown>)[key]);
      }
    }
  }

  walk(root);
  return videos;
}

function parseRssVideos(xml: string, channelName: string): YouTubeVideo[] {
  const entryMatches = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi));
  const videos: YouTubeVideo[] = [];

  for (let i = 0; i < Math.min(entryMatches.length, 6); i++) {
    const entry = entryMatches[i][1];
    const idMatch = entry.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/i);
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["']/i);
    const descMatch = entry.match(/<media:description>([\s\S]*?)<\/media:description>/i);
    const dateMatch = entry.match(/<published>([\s\S]*?)<\/published>/i);
    const authorMatch = entry.match(/<author>\s*<name>([\s\S]*?)<\/name>/i);

    const videoId = idMatch ? cleanText(idMatch[1]) : "";
    const rawTitle = titleMatch ? cleanText(titleMatch[1]) : "";
    const url = linkMatch ? linkMatch[1] : videoId ? `https://www.youtube.com/watch?v=${videoId}` : "";
    const desc = descMatch ? cleanText(descMatch[1]) : "";
    const author = authorMatch ? cleanText(authorMatch[1]) : channelName;

    if (videoId && rawTitle) {
      videos.push({
        id: videoId,
        title: rawTitle,
        url,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        publishedAt: "최신",
        channelTitle: author,
        channelId: "",
        description: desc,
      });
    }
  }

  return videos;
}

async function fetchChannelVideos(sourceUrl: string, channelName: string): Promise<YouTubeVideo[]> {
  try {
    let targetUrl = sourceUrl;
    if (!targetUrl.startsWith("http")) {
      const handle = targetUrl.startsWith("@") ? targetUrl : "@" + targetUrl;
      targetUrl = `https://www.youtube.com/${handle}/videos`;
    } else if (targetUrl.includes("channel_id=") || targetUrl.includes("/feeds/videos.xml")) {
      // RSS URL
    } else if (!targetUrl.includes("/videos")) {
      targetUrl = targetUrl.replace(/\/$/, "") + "/videos";
    }

    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      // RSS URL 실패 시 핸들 URL로 2차 시도
      if (targetUrl.includes("feeds/videos.xml")) {
        const handleGuess = channelName.toLowerCase().replace(/\s+/g, "");
        return await fetchChannelVideos(`@${handleGuess}`, channelName);
      }
      return [];
    }

    const bodyText = await res.text();

    // 1. HTML인 경우 ytInitialData 파싱
    if (bodyText.includes("ytInitialData")) {
      const parsed = parseYoutubeVideosFromHtml(bodyText, channelName);
      if (parsed.length > 0) return parsed;
    }

    // 2. RSS XML인 경우
    if (bodyText.includes("<feed") || bodyText.includes("<entry>")) {
      const rssParsed = parseRssVideos(bodyText, channelName);
      if (rssParsed.length > 0) return rssParsed;
    }

    return [];
  } catch (error) {
    console.error(`[fetchChannelVideos Error: ${channelName}]`, error);
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      bundleId?: string;
      channels?: { id: string; name: string; rssUrl: string; customUrl?: string }[];
      bundleName?: string;
      refresh?: boolean;
    };

    const bundleId = body.bundleId || "bundle-custom";
    const refresh = Boolean(body.refresh);

    // 캐시 확인
    if (!refresh) {
      const cached = bundleCache.get(bundleId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.data.videos.length > 0) {
        return NextResponse.json({ ...cached.data, cached: true });
      }
    }

    // 채널 목록 파악 (전달된 채널 또는 기본 프리셋에서 탐색)
    let channels = body.channels;
    let bundleName = body.bundleName || "유튜브 묶음";

    const matchedPreset = DEFAULT_YOUTUBE_BUNDLES.find((b) => b.id === bundleId);
    if (!channels || channels.length === 0) {
      if (matchedPreset) {
        channels = matchedPreset.channels;
        bundleName = matchedPreset.name;
      } else {
        channels = DEFAULT_YOUTUBE_BUNDLES[0].channels;
        bundleName = DEFAULT_YOUTUBE_BUNDLES[0].name;
      }
    }

    // 병렬로 채널 피드 수집
    const results = await Promise.all(
      channels.map((ch) => {
        // customUrl 우선 사용
        const urlToFetch = ch.customUrl || ch.rssUrl;
        return fetchChannelVideos(urlToFetch, ch.name);
      })
    );

    let allVideos = results.flat();

    // 혹시라도 채널들의 수집 결과가 모두 0개일 경우, 프리셋의 customUrl로 한 번 더 재시도
    if (allVideos.length === 0 && matchedPreset) {
      const retryResults = await Promise.all(
        matchedPreset.channels.map((ch) => fetchChannelVideos(ch.customUrl || ch.rssUrl, ch.name))
      );
      allVideos = retryResults.flat();
    }

    // AI 다이제스트 브리핑 생성
    let briefing = null;
    if (allVideos.length > 0) {
      const summaryItems = allVideos.slice(0, 6).map((v) => ({
        id: v.id,
        title: `[${v.channelTitle}] ${v.title}`,
        text: v.description || v.title,
      }));

      try {
        const summaryOutput = await summarizeSiteContent(bundleName, summaryItems, "video");
        briefing = summaryOutput.briefing;

        // 개별 비디오 요약 매핑
        for (const v of allVideos) {
          if (summaryOutput.byId[v.id]) {
            v.summary = summaryOutput.byId[v.id].summary;
            v.points = summaryOutput.byId[v.id].points;
          }
        }
      } catch (aiErr) {
        console.warn("[YouTube Bundle AI Briefing Error]", aiErr);
      }
    }

    const responseData: YouTubeBundleApiResponse = {
      success: true,
      bundleId,
      bundleName,
      videos: allVideos,
      briefing,
      cached: false,
    };

    if (allVideos.length > 0) {
      bundleCache.set(bundleId, { data: responseData, timestamp: Date.now() });
    }

    return NextResponse.json(responseData);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.error("[POST /api/youtube/bundle] Error:", message);
    return NextResponse.json(
      { success: false, reason: "유튜브 번들 피드를 가져오지 못했습니다.", videos: [] },
      { status: 500 }
    );
  }
}
