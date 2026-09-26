import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { cleanTextForSpeech, getEdgePersonaVoiceConfig } from "@/lib/ai/voiceUtils";

export const runtime = "nodejs";

const MAX_TEXT_LENGTH = 800;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawText = typeof body.text === "string" ? body.text : "";
    const presetId = typeof body.presetId === "string" ? body.presetId : undefined;

    const cleaned = cleanTextForSpeech(rawText);
    if (!cleaned) {
      return NextResponse.json({ error: "Text is empty or invalid" }, { status: 400 });
    }

    const textToSynthesize = cleaned.slice(0, MAX_TEXT_LENGTH);
    const voiceConfig = getEdgePersonaVoiceConfig(presetId);

    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voiceConfig.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(textToSynthesize, {
        pitch: voiceConfig.pitch,
        rate: voiceConfig.rate,
      });

      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const audioBuffer = Buffer.concat(chunks);

      return new Response(audioBuffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(audioBuffer.length),
          "Cache-Control": "private, no-store",
        },
      });
    } finally {
      try {
        tts.close();
      } catch {
        // 무시
      }
    }
  } catch (error) {
    console.error("[API voice/tts] Error generating speech:", error);
    return NextResponse.json(
      { error: "Failed to generate speech audio" },
      { status: 500 }
    );
  }
}
