const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;
const HANDLE_RE = /^@?[a-zA-Z0-9._-]{2,100}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return url;
  } catch {
    return null;
  }
}

export function parseYouTubeVideoId(value: string): string | null {
  const input = value.trim();
  if (VIDEO_ID_RE.test(input)) return input;

  const url = parseHttpsUrl(input);
  if (!url) return null;

  if (url.hostname === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return VIDEO_ID_RE.test(id) ? id : null;
  }
  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;

  const pathParts = url.pathname.split("/").filter(Boolean);
  const candidate =
    url.pathname === "/watch"
      ? url.searchParams.get("v") ?? ""
      : ["embed", "v", "shorts", "live"].includes(pathParts[0] ?? "")
        ? pathParts[1] ?? ""
        : "";
  return VIDEO_ID_RE.test(candidate) ? candidate : null;
}

export function normalizeYouTubeVideoUrl(value: string): string | null {
  const videoId = parseYouTubeVideoId(value);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

export function normalizeYouTubeChannelUrl(value: string): string | null {
  const input = value.trim();
  if (!input || input.length > 500) return null;

  if (CHANNEL_ID_RE.test(input)) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${input}`;
  }
  if (HANDLE_RE.test(input)) {
    const handle = input.startsWith("@") ? input : `@${input}`;
    return `https://www.youtube.com/${handle}/videos`;
  }

  const url = parseHttpsUrl(input);
  if (!url || !YOUTUBE_HOSTS.has(url.hostname)) return null;

  if (url.pathname === "/feeds/videos.xml") {
    const channelId = url.searchParams.get("channel_id") ?? "";
    return CHANNEL_ID_RE.test(channelId)
      ? `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
      : null;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const first = parts[0] ?? "";
  const second = parts[1] ?? "";
  const isHandle = HANDLE_RE.test(first) && first.startsWith("@");
  const isChannel = first === "channel" && CHANNEL_ID_RE.test(second);
  const isLegacyChannel = ["c", "user"].includes(first) && /^[a-zA-Z0-9._-]{1,100}$/.test(second);
  if (!isHandle && !isChannel && !isLegacyChannel) return null;

  const basePath = isHandle ? `/${first}` : `/${first}/${second}`;
  return `https://www.youtube.com${basePath}/videos`;
}

export function isAllowedYouTubeCaptionUrl(value: string): boolean {
  const url = parseHttpsUrl(value);
  return Boolean(
    url &&
      YOUTUBE_HOSTS.has(url.hostname) &&
      url.pathname === "/api/timedtext"
  );
}
