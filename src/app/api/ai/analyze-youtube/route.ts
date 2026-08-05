import { NextResponse } from "next/server";
import { analyzeYoutube } from "@/lib/ai/gemini";

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ success: false, error: "Invalid URL provided." }, { status: 400 });
    }

    if (!url.match(/youtube\.com|youtu\.be/i)) {
      return NextResponse.json({ success: false, error: "Not a valid YouTube URL." }, { status: 400 });
    }

    const summary = await analyzeYoutube(url);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.error("[POST /api/ai/analyze-youtube] Error:", message);
    return NextResponse.json(
      { success: false, error: message || "Failed to analyze YouTube video." },
      { status: 500 }
    );
  }
}
