import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";
import {
  generateGeminiContent,
  geminiResponseText,
  isGeminiConfigured,
  type GeminiGenerateResponse,
} from "@/lib/ai/gemini";

export interface MeetingTranscriptSegment {
  speaker: string;
  text: string;
}

const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/x-m4a",
  "audio/aac",
]);

// Vercel Function 요청 본문 4.5MB 제한보다 낮게 유지합니다(멀티파트 오버헤드 포함).
const MAX_AUDIO_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_DURATION_SECONDS = 10 * 60;



export async function POST(req: NextRequest) {
  // 1. 인증 확인
  const auth = await requireSupabaseUser("로그인이 필요합니다.");
  if (!auth.ok) return auth.response;

  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File | null;
    const mode = String(formData.get("mode") || "dictation");
    const durationSeconds = Number(formData.get("durationSeconds") || 0);

    if (!file) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    // 2. 용량 검증 (413 Payload Too Large)
    if (file.size > MAX_AUDIO_SIZE_BYTES) {
      return NextResponse.json(
        { error: "오디오 파일 크기가 배포 제한(4MB)을 초과했습니다." },
        { status: 413 }
      );
    }

    if (Number.isFinite(durationSeconds) && durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
      return NextResponse.json(
        { error: "음성 녹음은 최대 10분까지 전사할 수 있습니다." },
        { status: 413 }
      );
    }

    // 3. MIME 타입 검증 (415 Unsupported Media Type)
    const baseMime = file.type.split(";")[0].toLowerCase();
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type) && !ALLOWED_MIME_TYPES.has(baseMime)) {
      return NextResponse.json(
        { error: `지원하지 않는 오디오 형식입니다: ${file.type}` },
        { status: 415 }
      );
    }

    if (!isGeminiConfigured()) {
      return NextResponse.json(
        { error: "AI 전사 서비스를 현재 사용할 수 없습니다." },
        { status: 503 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Audio = buffer.toString("base64");
    const mimeType = file.type || "audio/webm";

    const promptText =
      mode === "meeting"
        ? "이 회의 오디오를 한국어로 정확하게 전사(음성 인식)해 주세요. 참석자들의 발언을 자연스럽게 텍스트로 풀어주되, 화자를 확실히 알 수 없을 땐 추측하지 말고 'A', 'B', 'C' 또는 'uncertain'으로 표시하세요. 반드시 JSON 배열 형태로 응답하세요. 각 요소는 { \"speaker\": string, \"text\": string } 형태여야 합니다. 부가적인 설명 없이 JSON 배열만 출력하세요."
        : "이 음성을 한국어로 정확하게 전사(STT)해 주세요. 말한 문장 그대로 텍스트만 출력하세요.";

    // 공용 진입점 사용 — 헤더 인증·429 쿼터 쿨다운을 gemini.ts가 일괄 관리
    let geminiData: GeminiGenerateResponse;
    try {
      geminiData = await generateGeminiContent(
        {
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Audio,
                  },
                },
              ],
            },
          ],
          generationConfig: mode === "meeting" ? { responseMimeType: "application/json" } : undefined,
        },
        { model: "gemini-2.5-flash" }
      );
    } catch {
      // 보안: 내부 API 키나 원문 오류 내용을 외부에 노출하지 않음
      return NextResponse.json(
        { error: "음성 인식 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 500 }
      );
    }

    const transcriptText = geminiResponseText(geminiData).trim();

    if (!transcriptText) {
      return NextResponse.json({ error: "음성에서 텍스트를 확인하지 못했습니다." }, { status: 422 });
    }

    let transcriptResult: string | MeetingTranscriptSegment[] = transcriptText;

    if (mode === "meeting") {
      try {
        transcriptResult = JSON.parse(transcriptText) as MeetingTranscriptSegment[];
      } catch (err) {
        console.warn("Failed to parse gemini response as JSON", transcriptText, err);
        // Fallback
        transcriptResult = [{ speaker: "unknown", text: transcriptText }];
      }
    }

    return NextResponse.json({
      transcript: transcriptResult,
      provider: "gemini",
      warnings: [],
    });
  } catch {
    return NextResponse.json({ error: "음성 전사 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
