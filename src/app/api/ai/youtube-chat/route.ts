import { NextResponse } from "next/server";
import { chatYoutube } from "@/lib/ai/gemini";

export const maxDuration = 60; // YouTube 분석 시 오래 걸릴 수 있으므로 타임아웃 60초로 연장

export async function POST(req: Request) {
  try {
    const { url, messages } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ success: false, error: "Invalid URL provided." }, { status: 400 });
    }

    if (!url.match(/youtube\.com|youtu\.be/i)) {
      return NextResponse.json({ success: false, error: "Not a valid YouTube URL." }, { status: 400 });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: false, error: "Messages array is required." }, { status: 400 });
    }

    const reply = await chatYoutube(url, messages);

    return NextResponse.json({
      success: true,
      reply: reply.text,
      timestamps: reply.timestamps || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.error("[POST /api/ai/youtube-chat] Error:", message);
    return NextResponse.json(
      { success: false, error: message || "Failed to process chat request." },
      { status: 500 }
    );
  }
}
