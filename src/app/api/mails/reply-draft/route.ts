// AI 답장 초안 생성 + Outlook 임시보관함 저장 — doc/phase5 §2.2

import { NextRequest, NextResponse } from "next/server";
import { isMockMode } from "@/lib/adapters/factory";
import { OutlookAdapter } from "@/lib/adapters/outlook";
import { generateReplyDraft } from "@/lib/ai/gemini";
import { readSession, unauthorized } from "@/lib/auth/cookies";

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    bodyContent?: string;
    source?: string;
  };
  if (!body.id || !body.bodyContent) {
    return NextResponse.json({ error: "id와 bodyContent가 필요합니다" }, { status: 400 });
  }

  const draftText = await generateReplyDraft(body.bodyContent);

  // Mock 항목이거나 MOCK_MODE면 Graph 저장은 모사하고 초안만 반환
  if (isMockMode() || body.id.startsWith("mock-")) {
    return NextResponse.json({ success: true, message: "답장 초안 다 썼어요! (Mock)", draftText });
  }

  // Gmail은 초안 저장 미지원(읽기 전용 scope) — 초안 텍스트만 반환
  if (body.source === "gmail" || !session.outlookToken) {
    return NextResponse.json({
      success: true,
      message: "답장 초안 다 썼어요! (Outlook을 연결하면 임시보관함까지 넣어드려요)",
      draftText,
    });
  }

  try {
    const adapter = new OutlookAdapter(session.outlookToken);
    await adapter.saveReplyDraft(body.id, draftText);
    return NextResponse.json({
      success: true,
      message: "답장 초안을 Outlook 임시보관함에 넣어뒀어요. 검토 후 전송만 눌러주세요!",
      draftText,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "초안 저장 실패", draftText },
      { status: 500 }
    );
  }
}
