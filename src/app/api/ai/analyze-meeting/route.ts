import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { topic, purpose, speakers, transcript, references } = body;

    if (!topic || !transcript) {
      return NextResponse.json({ error: "주제와 전사 텍스트는 필수입니다." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: promptText }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "AI 처리 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    const geminiData = await res.json();
    const summaryText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!summaryText) {
      return NextResponse.json({ error: "AI 요약 결과를 받지 못했습니다." }, { status: 422 });
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(summaryText);
    } catch (e) {
      console.warn("Failed to parse meeting analysis JSON", summaryText);
      return NextResponse.json({ error: "AI 분석 결과가 올바른 형식이 아닙니다." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      analysis: parsedResult
    });
  } catch (err) {
    return NextResponse.json({ error: "서버 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
