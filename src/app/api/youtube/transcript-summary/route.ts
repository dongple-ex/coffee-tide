import { NextRequest, NextResponse } from "next/server";
import type { YouTubeChapter } from "@/lib/types/youtube";
import { isAllowedYouTubeCaptionUrl, parseYouTubeVideoId } from "@/lib/youtube/url";
import { isYouTubeRequestRateLimited } from "@/lib/youtube/rateLimit";
import { readResponseTextLimited } from "@/lib/youtube/server";

const PAGE_TIMEOUT_MS = 8_000;
const PLAYER_TIMEOUT_MS = 5_000;
const CAPTION_TIMEOUT_MS = 6_000;
const AI_TIMEOUT_MS = 7_000;
const MAX_TRANSCRIPT_CHARS = 12_000;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_CAPTION_BYTES = 2 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#10;|&#xA;/gi, "\n")
    .replace(/&#13;|&#xD;/gi, "\r")
    .trim();
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

function parseChaptersFromText(rawText: string): YouTubeChapter[] {
  const text = decodeHtml(rawText).replace(/\u00a0/g, " ");
  const matches = Array.from(
    text.matchAll(/(?:^|[\s|•·])(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?=\s|[-–—:|•·])/gm)
  );
  const chapters: YouTubeChapter[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const hours = match[1] ? Number(match[1]) : 0;
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if (minutes > 59 || seconds > 59) continue;

    const labelStart = (match.index ?? 0) + match[0].length;
    const labelEnd = matches[index + 1]?.index ?? text.length;
    const label = text
      .slice(labelStart, labelEnd)
      .replace(/^[\s|•·:—–-]+/, "")
      .replace(/[\s|•·]+$/, "")
      .trim();
    if (!label || label.length > 180) continue;

    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    chapters.push({
      time: hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${minutes}:${String(seconds).padStart(2, "0")}`,
      seconds: totalSeconds,
      label,
    });
    if (chapters.length >= 40) break;
  }
  return chapters;
}

function playerDetails(playerResponse: unknown): { title: string; description: string; captionUrl: string } {
  if (!isRecord(playerResponse)) return { title: "", description: "", captionUrl: "" };
  const videoDetails = isRecord(playerResponse.videoDetails) ? playerResponse.videoDetails : {};
  const captions = isRecord(playerResponse.captions) ? playerResponse.captions : {};
  const renderer = isRecord(captions.playerCaptionsTracklistRenderer)
    ? captions.playerCaptionsTracklistRenderer
    : {};
  const tracks = Array.isArray(renderer.captionTracks) ? renderer.captionTracks : [];
  const preferredTrack = tracks.find((track) => isRecord(track) && track.languageCode === "ko") ?? tracks[0];
  return {
    title: decodeHtml(typeof videoDetails.title === "string" ? videoDetails.title : ""),
    description: decodeHtml(typeof videoDetails.shortDescription === "string" ? videoDetails.shortDescription : ""),
    captionUrl: isRecord(preferredTrack) && typeof preferredTrack.baseUrl === "string" ? preferredTrack.baseUrl : "",
  };
}

function youtubeConfigValue(html: string, key: string): string {
  const match = html.match(new RegExp(`"${key}":"([^"\\\\]+)"`));
  return match?.[1] ?? "";
}

async function fetchPlayerResponse(videoId: string, pageHtml: string): Promise<unknown> {
  const apiKey = youtubeConfigValue(pageHtml, "INNERTUBE_API_KEY");
  const webVersion = youtubeConfigValue(pageHtml, "INNERTUBE_CLIENT_VERSION");
  if (!apiKey || !webVersion || !/^[a-zA-Z0-9_-]+$/.test(apiKey) || !/^[0-9.]+$/.test(webVersion)) {
    return null;
  }

  const clients = [
    {
      name: "ANDROID",
      version: "20.10.38",
      id: "3",
      userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
      extra: { androidSdkVersion: 34 },
    },
    {
      name: "WEB",
      version: webVersion,
      id: "1",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      extra: {},
    },
  ];
  let fallback: unknown = null;

  for (const client of clients) {
    const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://www.youtube.com",
        "User-Agent": client.userAgent,
        "X-YouTube-Client-Name": client.id,
        "X-YouTube-Client-Version": client.version,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: client.name,
            clientVersion: client.version,
            hl: "ko",
            gl: "KR",
            ...client.extra,
          },
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
      signal: AbortSignal.timeout(PLAYER_TIMEOUT_MS),
    });
    if (!response.ok) continue;
    const raw = await readResponseTextLimited(response, MAX_PAGE_BYTES);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    fallback ??= parsed;
    if (playerDetails(parsed).captionUrl) return parsed;
  }
  return fallback;
}

async function fetchTranscript(captionUrl: string): Promise<string> {
  if (!captionUrl || !isAllowedYouTubeCaptionUrl(captionUrl)) return "";
  const baseUrl = new URL(captionUrl);
  const jsonUrl = new URL(baseUrl);
  jsonUrl.searchParams.set("fmt", "json3");
  const vttUrl = new URL(baseUrl);
  vttUrl.searchParams.set("fmt", "vtt");
  const simpleUrl = new URL("https://www.youtube.com/api/timedtext");
  for (const key of ["v", "lang", "kind", "name", "tlang"]) {
    const value = baseUrl.searchParams.get(key);
    if (value) simpleUrl.searchParams.set(key, value);
  }
  const simpleJsonUrl = new URL(simpleUrl);
  simpleJsonUrl.searchParams.set("fmt", "json3");
  const simpleVttUrl = new URL(simpleUrl);
  simpleVttUrl.searchParams.set("fmt", "vtt");
  const candidates = Array.from(new Set([
    jsonUrl.href,
    vttUrl.href,
    baseUrl.href,
    simpleJsonUrl.href,
    simpleVttUrl.href,
    simpleUrl.href,
  ]));
  const signal = AbortSignal.timeout(CAPTION_TIMEOUT_MS);

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { redirect: "error", signal });
      if (!response.ok) continue;
      const rawPayload = await readResponseTextLimited(response, MAX_CAPTION_BYTES);
      const text = transcriptText(rawPayload);
      if (text) return text.slice(0, MAX_TRANSCRIPT_CHARS);
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  return "";
}

function transcriptText(rawPayload: string): string {
  const raw = rawPayload.trim();
  if (!raw) return "";

  if (raw.startsWith("{")) {
    try {
      const payload = JSON.parse(raw) as {
        events?: Array<{ segs?: Array<{ utf8?: string }> }>;
      };
      return (payload.events ?? [])
        .flatMap((event) => event.segs ?? [])
        .map((segment) => segment.utf8 ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    } catch {
      return "";
    }
  }

  if (raw.startsWith("WEBVTT")) {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) =>
        Boolean(line) &&
        line !== "WEBVTT" &&
        !line.includes("-->") &&
        !/^\d+$/.test(line) &&
        !/^NOTE(?:\s|$)/.test(line)
      )
      .map((line) => decodeHtml(line.replace(/<[^>]+>/g, " ")))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const tagName = /<text\b/i.test(raw) ? "text" : /<s\b/i.test(raw) ? "s" : "p";
  const segments = Array.from(
    raw.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"))
  );
  return segments
    .map((match) => decodeHtml(match[1].replace(/<[^>]+>/g, " ")))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    if (isYouTubeRequestRateLimited(req, "youtube-transcript", 8)) {
      return NextResponse.json(
        { success: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    const rawBody: unknown = await req.json();
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json({ success: false, error: "요청 본문은 JSON 객체여야 합니다." }, { status: 400 });
    }
    const body = rawBody as { url?: unknown; videoId?: unknown };
    const raw = typeof body.videoId === "string"
      ? body.videoId
      : typeof body.url === "string"
        ? body.url
        : "";
    const videoId = parseYouTubeVideoId(raw);
    if (!videoId) {
      return NextResponse.json(
        { success: false, error: "유효한 YouTube 비디오 ID 또는 URL이 아닙니다." },
        { status: 400 }
      );
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResponse = await fetch(videoUrl, {
      redirect: "error",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });

    let title = "";
    let description = "";
    let transcript = "";
    let chapters: YouTubeChapter[] = [];
    if (pageResponse.ok) {
      const html = await readResponseTextLimited(pageResponse, MAX_PAGE_BYTES);
      let details = playerDetails(extractAssignedJson(html, "ytInitialPlayerResponse"));
      let alternateDetails: ReturnType<typeof playerDetails> | null = null;
      if (!details.captionUrl) {
        try {
          alternateDetails = playerDetails(await fetchPlayerResponse(videoId, html));
          details = {
            title: details.title || alternateDetails.title,
            description: details.description || alternateDetails.description,
            captionUrl: alternateDetails.captionUrl,
          };
        } catch (playerError) {
          console.warn("[YouTube Player Metadata Error]", playerError);
        }
      }
      title = details.title;
      description = details.description;
      chapters = parseChaptersFromText(description);
      try {
        transcript = await fetchTranscript(details.captionUrl);
      } catch (captionError) {
        console.warn("[YouTube Transcript Fetch Error]", captionError);
      }
    }

    const sourceText = transcript || description;
    const summarySource = transcript ? "transcript" : description ? "description" : "none";
    let summary = sourceText ? `${sourceText.slice(0, 260)}${sourceText.length > 260 ? "…" : ""}` : "영상 요약 정보가 없습니다.";
    let points = chapters.slice(0, 3).map((chapter) => chapter.label);

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && sourceText) {
      try {
        const prompt = `역할: 유튜브 영상 요약기
영상 제목: ${title}
자료 종류: ${transcript ? "영상 자막" : "영상 설명란"}
자료:
${sourceText.slice(0, 6000)}

제공된 자료에 실제로 있는 내용만 사용해 다음 JSON으로 응답하세요.
{"summary":"핵심 줄글 요약(120~240자)","points":["핵심 1","핵심 2","핵심 3"]}`;
        const aiResponse = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json" },
            }),
            signal: AbortSignal.timeout(AI_TIMEOUT_MS),
          }
        );
        if (aiResponse.ok) {
          const aiJson = await aiResponse.json();
          const text = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (typeof text === "string") {
            const parsed = JSON.parse(text) as { summary?: unknown; points?: unknown };
            if (typeof parsed.summary === "string" && parsed.summary.trim()) summary = parsed.summary.trim();
            if (Array.isArray(parsed.points)) {
              points = parsed.points.map((point) => String(point).trim()).filter(Boolean).slice(0, 3);
            }
          }
        }
      } catch (aiError) {
        console.warn("[YouTube Transcript Summary AI Error]", aiError);
      }
    }

    return NextResponse.json({
      success: true,
      videoId,
      title,
      summary,
      points,
      chapters,
      summarySource,
      transcriptAvailable: Boolean(transcript),
      url: videoUrl,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (error instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: "요청 또는 YouTube 응답 형식이 올바르지 않습니다." }, { status: 400 });
    }
    console.error("[POST /api/youtube/transcript-summary] Error:", message);
    return NextResponse.json({ success: false, error: "영상 정보를 가져오지 못했습니다." }, { status: 502 });
  }
}
