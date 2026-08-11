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

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "최신";
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "방금 전";
    if (diffHours < 24) return `${diffHours}시간 전`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}일 전`;
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  } catch {
    return "최신";
  }
}

async function fetchChannelVideos(rssUrl: string, channelName: string): Promise<YouTubeVideo[]> {
  try {
    const res = await fetch(rssUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) return [];

    const xml = await res.text();
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
      const url = linkMatch ? linkMatch[1] : (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");
      const desc = descMatch ? cleanText(descMatch[1]) : "";
      const date = dateMatch ? formatDate(dateMatch[1]) : "최신";
      const author = authorMatch ? cleanText(authorMatch[1]) : channelName;

      if (videoId && rawTitle) {
        videos.push({
          id: videoId,
          title: rawTitle,
          url,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          publishedAt: date,
          channelTitle: author,
          channelId: "",
          description: desc,
        });
      }
    }

    return videos;
  } catch (error) {
    console.error(`[fetchChannelVideos Error: ${channelName}]`, error);
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      bundleId?: string;
      channels?: { id: string; name: string; rssUrl: string }[];
      bundleName?: string;
      refresh?: boolean;
    };

    const bundleId = body.bundleId || "bundle-custom";
    const refresh = Boolean(body.refresh);

    // 캐시 확인
    if (!refresh) {
      const cached = bundleCache.get(bundleId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return NextResponse.json({ ...cached.data, cached: true });
      }
    }

    // 채널 목록 파악 (전달된 채널 또는 기본 프리셋에서 탐색)
    let channels = body.channels;
    let bundleName = body.bundleName || "유튜브 묶음";

    if (!channels || channels.length === 0) {
      const matchedPreset = DEFAULT_YOUTUBE_BUNDLES.find((b) => b.id === bundleId);
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
      channels.map((ch) => fetchChannelVideos(ch.rssUrl, ch.name))
    );

    const allVideos = results.flat();

    // AI 다이제스트 브리핑 생성
    let briefing = null;
    if (allVideos.length > 0) {
      const summaryItems = allVideos.slice(0, 6).map((v) => ({
        id: v.id,
        title: `[${v.channelTitle}] ${v.title}`,
        text: v.description || v.title,
      }));

      const summaryOutput = await summarizeSiteContent(bundleName, summaryItems, "video");
      briefing = summaryOutput.briefing;

      // 개별 비디오 요약 매핑
      for (const v of allVideos) {
        if (summaryOutput.byId[v.id]) {
          v.summary = summaryOutput.byId[v.id].summary;
          v.points = summaryOutput.byId[v.id].points;
        }
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

    bundleCache.set(bundleId, { data: responseData, timestamp: Date.now() });

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
