import { NextRequest, NextResponse } from "next/server";
import { analyzeYoutube } from "@/lib/ai/gemini";
import { normalizeYouTubeVideoUrl } from "@/lib/youtube/url";
import { isYouTubeRequestRateLimited } from "@/lib/youtube/rateLimit";
import { youtubeAiErrorStatus } from "@/lib/youtube/aiError";

export async function POST(req: NextRequest) {
  try {
    if (isYouTubeRequestRateLimited(req, "youtube-analyze", 6)) {
      return NextResponse.json(
        { success: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "요청 본문은 JSON 객체여야 합니다." }, { status: 400 });
    }
    const { url } = body as Record<string, unknown>;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ success: false, error: "Invalid URL provided." }, { status: 400 });
    }

    const normalizedUrl = normalizeYouTubeVideoUrl(url);
    if (!normalizedUrl) {
      return NextResponse.json({ success: false, error: "Not a valid YouTube URL." }, { status: 400 });
    }

    const summary = await analyzeYoutube(normalizedUrl);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (error instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: "JSON 요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    console.error("[POST /api/ai/analyze-youtube] Error:", message);
    return NextResponse.json(
      { success: false, error: message || "Failed to analyze YouTube video." },
      { status: youtubeAiErrorStatus(message) }
    );
  }
}
