import { NextRequest, NextResponse } from "next/server";
import { chatYoutube } from "@/lib/ai/gemini";
import { normalizeYouTubeVideoUrl } from "@/lib/youtube/url";
import { isYouTubeRequestRateLimited } from "@/lib/youtube/rateLimit";
import { youtubeAiErrorStatus } from "@/lib/youtube/aiError";

export const maxDuration = 60; // YouTube 분석 시 오래 걸릴 수 있으므로 타임아웃 60초로 연장

export async function POST(req: NextRequest) {
  try {
    if (isYouTubeRequestRateLimited(req, "youtube-chat", 6)) {
      return NextResponse.json(
        { success: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "요청 본문은 JSON 객체여야 합니다." }, { status: 400 });
    }
    const { url, messages } = body as Record<string, unknown>;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ success: false, error: "Invalid URL provided." }, { status: 400 });
    }

    const normalizedUrl = normalizeYouTubeVideoUrl(url);
    if (!normalizedUrl) {
      return NextResponse.json({ success: false, error: "Not a valid YouTube URL." }, { status: 400 });
    }

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 12) {
      return NextResponse.json({ success: false, error: "Messages array is required." }, { status: 400 });
    }
    const safeMessages = messages.map((message: unknown) => {
      if (!message || typeof message !== "object") return null;
      const record = message as Record<string, unknown>;
      if (record.role !== "user" && record.role !== "model") return null;
      const content = typeof record.content === "string" ? record.content.trim() : "";
      if (!content || content.length > 2_000) return null;
      return { role: record.role, content };
    });
    if (safeMessages.some((message: unknown) => message === null)) {
      return NextResponse.json({ success: false, error: "Invalid chat message." }, { status: 400 });
    }

    const conversation = safeMessages as { role: "user" | "model"; content: string }[];
    const firstUserIndex = conversation.findIndex((message) => message.role === "user");
    if (firstUserIndex < 0) {
      return NextResponse.json({ success: false, error: "A user message is required." }, { status: 400 });
    }
    const reply = await chatYoutube(normalizedUrl, conversation.slice(firstUserIndex));

    return NextResponse.json({
      success: true,
      reply: reply.text,
      timestamps: reply.timestamps || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (error instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: "JSON 요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    console.error("[POST /api/ai/youtube-chat] Error:", message);
    return NextResponse.json(
      { success: false, error: message || "Failed to process chat request." },
      { status: youtubeAiErrorStatus(message) }
    );
  }
}
