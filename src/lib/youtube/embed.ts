export const YOUTUBE_EMBED_ORIGIN = "https://www.youtube-nocookie.com";
export const YOUTUBE_PIP_MESSAGE = "coffeetide:youtube-pip";

export function youtubeWatchUrl(videoId: string, seconds = 0): string {
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", videoId);
  if (Number.isFinite(seconds) && seconds > 0) url.searchParams.set("t", `${Math.floor(seconds)}s`);
  return url.href;
}

export interface YouTubePlaybackSnapshot {
  start: number;
  autoplay: boolean;
  muted: boolean;
  rate: number;
}

export function youtubeEmbedUrl(videoId: string, origin: string, playback: Pick<YouTubePlaybackSnapshot, "start" | "autoplay">): string {
  const url = new URL(`/embed/${videoId}`, YOUTUBE_EMBED_ORIGIN);
  url.search = new URLSearchParams({
    enablejsapi: "1", autoplay: playback.autoplay ? "1" : "0", rel: "0",
    iv_load_policy: "3", playsinline: "1", origin,
    start: String(Math.max(0, Math.floor(playback.start))),
  }).toString();
  return url.href;
}

export function youtubePiPUrl(videoId: string, playback: YouTubePlaybackSnapshot): string {
  return `/youtube/pip?${new URLSearchParams({
    v: videoId, start: String(Math.max(0, Math.floor(playback.start))),
    autoplay: playback.autoplay ? "1" : "0", muted: playback.muted ? "1" : "0", rate: String(playback.rate),
  })}`;
}

/** PiP 메시지는 현재 창에 붙어 있는 플레이어만 보낼 수 있다. */
export function youtubePlayerMessage(event: Pick<MessageEvent, "source" | "origin" | "data">, origin: string, mainPlayer: Window | null, pipPlayer: Window | null): Record<string, unknown> | null {
  const fromPiP = Boolean(pipPlayer && event.source === pipPlayer && event.origin === origin);
  const fromMain = Boolean(mainPlayer && event.source === mainPlayer && [YOUTUBE_EMBED_ORIGIN, "https://www.youtube.com"].includes(event.origin));
  if (!fromPiP && !fromMain) return null;
  try {
    let data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    if (fromPiP) {
      if (data?.type !== YOUTUBE_PIP_MESSAGE) return null;
      data = data.payload;
    }
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch { return null; }
}
