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
    const { topic, purpose, speakers, outputPreset, transcript } = body;

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
      ? `화자 매핑 정보: ${speakers.map((s: any) => `${s.label} -> ${s.displayName}`).join(", ")}`
      : "";

    const promptText = `
당신은 탁월한 업무 비서입니다. 아래 제공된 회의 전사 내용을 분석하여 구조화된 회의록을 작성해 주세요.

[회의 정보]
- 회의 주제: ${topic}
- 회의 목적: ${purpose || "지정되지 않음"}
- ${speakersText}
- 결과 형식: ${outputPreset === 'executive' ? '경영진 요약 (핵심만 간결하게)' : outputPreset === 'decisions' ? '결정사항 중심' : outputPreset === 'actions' ? '할 일(Action Item) 중심' : '기본 회의록 (주제별 요약 및 할 일)'}

[출력 요구사항]
다음 구조로 Markdown 텍스트를 작성하세요:
1. 회의 개요 및 주제별 요약
2. 확정된 결정사항 (가능하면 근거 시간 구간 포함)
3. 할 일 후보 (담당자 후보, 기한 후보 포함. 확실치 않으면 '미정'으로 표시)
4. 미해결 질문 및 추가 확인이 필요한 내용

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

    // AI 결과를 'pending' 상태의 meeting_summary로 저장
    const nowIso = new Date().toISOString();
    const meetingSummaryItem = {
      id: `meeting-${Date.now()}`,
      user_id: user.id,
      source: "manual",
      title: `[회의록] ${topic}`,
      content: summaryText,
      created_at: nowIso,
      updated_at: nowIso,
      author: { name: user.email || "사용자" },
      url: "",
      status: "pending",
      item_type: "note",
      attributes: { captureMode: "meeting", originalTopic: topic, outputPreset },
      version: 1,
      privacy_scope: "cloud_private",
      ai_policy: "cloud_allowed",
    };

    const { error: insertError } = await supabase
      .from("unified_items")
      .insert(meetingSummaryItem);

    if (insertError) {
      return NextResponse.json({ error: "회의록 저장 중 오류가 발생했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      summary: summaryText,
      itemId: meetingSummaryItem.id
    });
  } catch (err) {
    return NextResponse.json({ error: "서버 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
