import { NextRequest, NextResponse } from "next/server";
import type { ContextualRecommendation } from "@/lib/types/youtube";
import { DEFAULT_YOUTUBE_BUNDLES } from "@/lib/youtube/presets";
import { fetchYouTubeChannelVideos } from "@/lib/youtube/server";
import { isYouTubeRequestRateLimited } from "@/lib/youtube/rateLimit";

type RecommendationCopy = Omit<ContextualRecommendation, "videos"> & { bundleId: string };

function hourInTimeZone(timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
  } catch {
    return null;
  }
}
function recommendationForHour(hour: number): RecommendationCopy {
  if (hour < 6) {
    return {
      contextType: "night",
      bundleId: "bundle-bgm",
      badge: "🌙 늦은 밤 잔잔한 집중 BGM",
      headline: "하루를 정리하거나 조용히 몰입할 때 듣기 좋은 최신 선곡입니다.",
      reason: "심야 시간대에 맞춘 차분한 음악 채널의 최신 영상",
    };
  }
  if (hour < 10) {
    return {
      contextType: "morning",
      bundleId: "bundle-finance",
      badge: "📈 모닝 경제 & 시황 브리핑",
      headline: "증시 개장 전, 경제 채널의 실제 최신 영상을 확인하세요.",
      reason: "아침 시간대 경제·글로벌 시황 채널의 최신 공개 영상",
    };
  }
  if (hour < 12) {
    return {
      contextType: "focus",
      bundleId: "bundle-bgm",
      badge: "🎧 오전 딥워크 집중 BGM",
      headline: "방해 없는 몰입을 위한 음악 채널의 최신 선곡입니다.",
      reason: "오전 집중 시간대 음악 채널의 최신 공개 영상",
    };
  }
  if (hour < 14) {
    return {
      contextType: "lunch",
      bundleId: "bundle-tech",
      badge: "💡 점심시간 테크 인사이트",
      headline: "커피 한 잔과 함께 가볍게 볼 수 있는 최신 개발·IT 영상입니다.",
      reason: "점심시간에 맞춘 개발·IT 채널의 최신 공개 영상",
    };
  }
  if (hour < 18) {
    return {
      contextType: "focus",
      bundleId: "bundle-bgm",
      badge: "☕ 오후 카페 음악 플레이리스트",
      headline: "오후의 흐름을 이어갈 수 있는 음악 채널의 최신 선곡입니다.",
      reason: "오후 집중 시간대 음악 채널의 최신 공개 영상",
    };
  }
  return {
    contextType: "evening",
    bundleId: "bundle-growth",
    badge: "🌙 퇴근길 자기계발 & 휴식",
    headline: "오늘을 정리하고 내일을 준비하는 최신 성장 콘텐츠입니다.",
    reason: "저녁 시간대 생산성·자기계발 채널의 최신 공개 영상",
  };
}

export async function GET(req: NextRequest) {
  if (isYouTubeRequestRateLimited(req, "youtube-recommend", 20)) {
    return NextResponse.json(
      { success: false, reason: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  const timeZone = req.nextUrl.searchParams.get("tz") || "Asia/Seoul";
  const hour = hourInTimeZone(timeZone);
  if (hour === null) {
    return NextResponse.json({ success: false, reason: "유효하지 않은 시간대입니다." }, { status: 400 });
  }

  try {
    const copy = recommendationForHour(hour);
    const bundle = DEFAULT_YOUTUBE_BUNDLES.find((candidate) => candidate.id === copy.bundleId);
    if (!bundle) throw new Error(`추천 번들을 찾을 수 없습니다: ${copy.bundleId}`);

    const results = await Promise.allSettled(
      bundle.channels.slice(0, 2).map(async (channel) => {
        const videos = await fetchYouTubeChannelVideos(channel.customUrl || channel.rssUrl, channel.name);
        return videos.slice(0, 1).map((video) => ({
          ...video,
          sourceChannelId: channel.id,
          sourceChannelName: channel.name,
        }));
      })
    );
    const videos = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    const recommendation: ContextualRecommendation = { ...copy, videos };
    delete (recommendation as ContextualRecommendation & { bundleId?: string }).bundleId;

    return NextResponse.json({ success: true, recommendation });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.error("[GET /api/youtube/recommend] Error:", message);
    return NextResponse.json({ success: false, reason: "추천 영상을 가져오지 못했습니다." }, { status: 502 });
  }
}
