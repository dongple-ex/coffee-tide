import { YouTubeVideo } from "../types/youtube";
import { normalizeYouTubeChannelUrl } from "./url";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEOS_PER_CHANNEL = 8;

function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nestedValue(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (Array.isArray(current)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function readResponseTextLimited(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) throw new Error("YouTube 응답 크기 제한을 초과했습니다.");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("YouTube 응답 크기 제한을 초과했습니다.");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function extractAssignedJson(html: string, marker: string): unknown {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = html.indexOf("{", markerIndex + marker.length);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseYoutubeVideosFromHtml(html: string, fallbackChannel: string): YouTubeVideo[] {
  const videos: YouTubeVideo[] = [];
  const root = extractAssignedJson(html, "ytInitialData");
  if (!root) return videos;

  function walk(node: unknown) {
    if (!node || typeof node !== "object" || videos.length >= MAX_VIDEOS_PER_CHANNEL) return;
    const record = node as Record<string, unknown>;
    const lvm = record.lockupViewModel;
    if (isRecord(lvm)) {
      const videoId = stringValue(lvm.contentId);
      const title =
        stringValue(nestedValue(lvm, ["metadata", "lockupMetadataViewModel", "title", "content"])) ||
        stringValue(nestedValue(lvm, ["rendererContext", "accessibilityContext", "label"]));
      if (/^[a-zA-Z0-9_-]{11}$/.test(videoId) && title && !videos.some((video) => video.id === videoId)) {
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

    const renderer = record.videoRenderer;
    if (isRecord(renderer)) {
      const videoId = stringValue(renderer.videoId);
      const title =
        stringValue(nestedValue(renderer, ["title", "runs", "0", "text"])) ||
        stringValue(nestedValue(renderer, ["title", "simpleText"]));
      const published = stringValue(nestedValue(renderer, ["publishedTimeText", "simpleText"])) || "최신";
      const channel = stringValue(nestedValue(renderer, ["ownerText", "runs", "0", "text"])) || fallbackChannel;
      if (/^[a-zA-Z0-9_-]{11}$/.test(videoId) && title && !videos.some((video) => video.id === videoId)) {
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
      for (const value of Object.values(record)) walk(value);
    }
  }

  walk(root);
  return videos;
}

function parseRssVideos(xml: string, channelName: string): YouTubeVideo[] {
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi));
  const videos: YouTubeVideo[] = [];
  for (let index = 0; index < Math.min(entries.length, 6); index += 1) {
    const entry = entries[index][1];
    const videoId = cleanText(entry.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/i)?.[1] ?? "");
    const title = cleanText(entry.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId) || !title) continue;

    const publishedAt = cleanText(entry.match(/<published>([\s\S]*?)<\/published>/i)?.[1] ?? "") || "최신";
    const description = cleanText(entry.match(/<media:description>([\s\S]*?)<\/media:description>/i)?.[1] ?? "");
    const author = cleanText(entry.match(/<author>\s*<name>([\s\S]*?)<\/name>/i)?.[1] ?? "") || channelName;
    videos.push({
      id: videoId,
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      publishedAt,
      channelTitle: author,
      channelId: "",
      description,
    });
  }
  return videos;
}

export async function fetchYouTubeChannelVideos(source: string, channelName: string): Promise<YouTubeVideo[]> {
  const targetUrl = normalizeYouTubeChannelUrl(source);
  if (!targetUrl) throw new Error("허용되지 않은 YouTube 채널 주소입니다.");

  const response = await fetch(targetUrl, {
    redirect: "error",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return [];

  const text = await readResponseTextLimited(response);
  if (text.includes("ytInitialData")) {
    const videos = parseYoutubeVideosFromHtml(text, channelName);
    if (videos.length > 0) return videos;
  }
  if (text.includes("<feed") || text.includes("<entry>")) {
    return parseRssVideos(text, channelName);
  }
  return [];
}
