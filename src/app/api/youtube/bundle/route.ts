import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_YOUTUBE_BUNDLES } from "@/lib/youtube/presets";
import { fetchYouTubeChannelVideos } from "@/lib/youtube/server";
import { normalizeYouTubeChannelUrl } from "@/lib/youtube/url";
import { summarizeSiteContent } from "@/lib/ai/gemini";
import type { YouTubeBundleApiResponse, YouTubeChannelSource, YouTubeVideo } from "@/lib/types/youtube";
import { isYouTubeRequestRateLimited } from "@/lib/youtube/rateLimit";

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CHANNELS = 8;
const MAX_TOTAL_VIDEOS = 40;
const RATE_LIMIT_REQUESTS = 10;
const AI_BRIEFING_TIMEOUT_MS = 4_500;

const bundleCache = new Map<string, { data: YouTubeBundleApiResponse; timestamp: number }>();

class RequestValidationError extends Error {}

function requestObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("요청 본문은 JSON 객체여야 합니다.");
  }
  return value as Record<string, unknown>;
}

function cleanExpiredState(): void {
  const now = Date.now();
  for (const [key, value] of bundleCache) {
    if (now - value.timestamp >= CACHE_TTL_MS) bundleCache.delete(key);
  }
}

function parseChannels(value: unknown): YouTubeChannelSource[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new RequestValidationError("채널 목록 형식이 올바르지 않습니다.");
  if (value.length > MAX_CHANNELS) {
    throw new RequestValidationError(`번들당 채널은 최대 ${MAX_CHANNELS}개까지 등록할 수 있습니다.`);
  }

  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object") {
      throw new RequestValidationError(`${index + 1}번째 채널 형식이 올바르지 않습니다.`);
    }
    const record = raw as Record<string, unknown>;
    const id = String(record.id ?? "").trim().slice(0, 120);
    const name = String(record.name ?? "").trim().slice(0, 80);
    const source = String(record.customUrl ?? record.rssUrl ?? "").trim();
    const normalizedUrl = normalizeYouTubeChannelUrl(source);
    if (!id || !name || !normalizedUrl) {
      throw new RequestValidationError(`${index + 1}번째 채널은 유효한 YouTube 채널 ID·핸들·URL이어야 합니다.`);
    }
    return { id, name, rssUrl: normalizedUrl, customUrl: normalizedUrl };
  });
}

function cacheKey(bundleId: string, bundleName: string, channels: YouTubeChannelSource[]): string {
  const payload = channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    url: channel.customUrl || channel.rssUrl,
  }));
  return createHash("sha256")
    .update(JSON.stringify({ bundleId, bundleName, channels: payload }))
    .digest("hex");
}

function sortByPublishedAt(videos: YouTubeVideo[]): YouTubeVideo[] {
  return videos
    .map((video, index) => ({ video, index, timestamp: Date.parse(video.publishedAt) }))
    .sort((a, b) => {
      if (Number.isFinite(a.timestamp) && Number.isFinite(b.timestamp)) return b.timestamp - a.timestamp;
      if (Number.isFinite(a.timestamp)) return -1;
      if (Number.isFinite(b.timestamp)) return 1;
      return a.index - b.index;
    })
    .map(({ video }) => video)
    .slice(0, MAX_TOTAL_VIDEOS);
}

function localBriefing(bundleName: string, videos: YouTubeVideo[]) {
  const points = videos.slice(0, 3).map((video) => `[${video.sourceChannelName || video.channelTitle}] ${video.title}`);
  return {
    headline: `${bundleName} 채널에서 최신 영상 ${videos.length}개를 확인했습니다.`,
    keyPoints: points,
  };
}

export async function POST(req: NextRequest) {
  cleanExpiredState();
  if (isYouTubeRequestRateLimited(req, "bundle", RATE_LIMIT_REQUESTS)) {
    return NextResponse.json(
      { success: false, reason: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", videos: [] },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const body = requestObject(await req.json());
    const bundleId = String(body.bundleId ?? "bundle-custom").trim().slice(0, 120) || "bundle-custom";
    const refresh = body.refresh === true;
    const matchedPreset = DEFAULT_YOUTUBE_BUNDLES.find((bundle) => bundle.id === bundleId);
    const requestedChannels = parseChannels(body.channels);
    const channels = requestedChannels?.length
      ? requestedChannels
      : matchedPreset?.channels ?? DEFAULT_YOUTUBE_BUNDLES[0].channels;
    const bundleName = String(body.bundleName ?? matchedPreset?.name ?? "유튜브 묶음").trim().slice(0, 80) || "유튜브 묶음";
    const key = cacheKey(bundleId, bundleName, channels);

    if (!refresh) {
      const cached = bundleCache.get(key);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.data.videos.length > 0) {
        return NextResponse.json({ ...cached.data, cached: true });
      }
    }

    const settled = await Promise.allSettled(
      channels.map(async (channel) => {
        const videos = await fetchYouTubeChannelVideos(channel.customUrl || channel.rssUrl, channel.name);
        return videos.map((video) => ({
          ...video,
          sourceChannelId: channel.id,
          sourceChannelName: channel.name,
        }));
      })
    );
    const partial = settled.some((result) => result.status === "rejected");
    const allVideos = sortByPublishedAt(
      settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    );

    let briefing = allVideos.length > 0 ? localBriefing(bundleName, allVideos) : null;
    if (allVideos.length > 0) {
      const summaryItems = allVideos.slice(0, 6).map((video) => ({
        id: video.id,
        title: `[${video.sourceChannelName || video.channelTitle}] ${video.title}`,
        text: video.description || video.title,
      }));
      const summaryOutput = await summarizeSiteContent(
        bundleName,
        summaryItems,
        "video",
        AbortSignal.timeout(AI_BRIEFING_TIMEOUT_MS)
      );
      if (summaryOutput.briefing) briefing = summaryOutput.briefing;
      for (const video of allVideos) {
        const item = summaryOutput.byId[video.id];
        if (item) {
          video.summary = item.summary;
          video.points = item.points;
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
      partial,
      reason: allVideos.length === 0 ? "등록된 채널에서 공개 영상을 가져오지 못했습니다." : undefined,
    };
    if (allVideos.length > 0) bundleCache.set(key, { data: responseData, timestamp: Date.now() });
    return NextResponse.json(responseData);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (error instanceof RequestValidationError || error instanceof SyntaxError) {
      return NextResponse.json({ success: false, reason: message || "요청 형식이 올바르지 않습니다.", videos: [] }, { status: 400 });
    }
    console.error("[POST /api/youtube/bundle] Error:", message);
    return NextResponse.json(
      { success: false, reason: "유튜브 번들 피드를 가져오지 못했습니다.", videos: [] },
      { status: 502 }
    );
  }
}
