import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";
import {
  generateGeminiContent,
  geminiResponseText,
  isGeminiConfigured,
  type GeminiGenerateResponse,
} from "@/lib/ai/gemini";

export async function POST(req: NextRequest) {
  const auth = await requireSupabaseUser("로그인이 필요합니다.");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { topic, purpose, speakers, transcript, references } = body;

    if (!topic || !transcript) {
      return NextResponse.json({ error: "주제와 전사 텍스트는 필수입니다." }, { status: 400 });
    }

    if (!isGeminiConfigured()) {
      return NextResponse.json(
        { error: "AI 분석 서비스를 현재 사용할 수 없습니다." },
        { status: 503 }
      );
    }

    const speakersText = Array.isArray(speakers) && speakers.length > 0
      ? `화자 매핑 정보: ${speakers.map((s: { label: string; displayName: string }) => `${s.label} -> ${s.displayName}`).join(", ")}`
      : "";

    const promptText = `
당신은 탁월한 업무 비서입니다. 아래 제공된 회의 전사 내용과 참고자료를 분석하여 지정된 JSON 구조로 응답해 주세요.

[회의 정보]
- 회의 주제: ${topic}
- 회의 목적: ${purpose || "지정되지 않음"}
- ${speakersText}

[출력 요구사항 (반드시 유효한 JSON 형식으로만 출력)]
{
  "overview": "회의 전체 개요 (1~2문장)",
  "topicSummaries": [
    { "topic": "소주제", "summary": "요약 내용" }
  ],
  "decisions": [
    { "decision": "결정사항 내용", "reason": "결정 근거 또는 배경" }
  ],
  "actionItems": [
    { "task": "할 일 내용", "assignee": "담당자(모르면 미정)", "dueDate": "기한(모르면 미정)" }
  ],
  "unresolvedQuestions": ["미해결 질문 1", "추가 논의가 필요한 사항 2"]
}

${references && references.length > 0 ? `[참고자료]\n${references.join("\n\n")}\n\n` : ""}
[회의 전사 내용]
${transcript}
`;

    // 공용 진입점 사용 — 헤더 인증·429 쿼터 쿨다운을 gemini.ts가 일괄 관리
    let geminiData: GeminiGenerateResponse;
    try {
      geminiData = await generateGeminiContent(
        {
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { responseMimeType: "application/json" },
        },
        { model: "gemini-2.5-flash" }
      );
    } catch {
      return NextResponse.json(
        { error: "AI 처리 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    const summaryText = geminiResponseText(geminiData).trim();

    if (!summaryText) {
      return NextResponse.json({ error: "AI 요약 결과를 받지 못했습니다." }, { status: 422 });
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(summaryText);
    } catch {
      console.warn("Failed to parse meeting analysis JSON", summaryText);
      return NextResponse.json({ error: "AI 분석 결과가 올바른 형식이 아닙니다." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      analysis: parsedResult
    });
  } catch {
    return NextResponse.json({ error: "서버 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
