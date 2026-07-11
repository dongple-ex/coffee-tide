// Copilot 브리핑/질의 — G3: 클라이언트가 병합한 목록(manual/paste 포함)을 그대로 컨텍스트로 받아
// 외부 연동이 전혀 없어도 동작. G4: 서버가 기준일·타임존을 주입.

import { NextRequest, NextResponse } from "next/server";
import { askCopilot } from "@/lib/ai/gemini";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { UnifiedData } from "@/lib/types/unified";

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    items?: UnifiedData[];
    timezone?: string;
  };

  const question = body.question?.trim() || "오늘 해야 할 일을 브리핑해줘";
  const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];

  const { answer, aiUsed } = await askCopilot(
    question,
    items,
    body.timezone || "Asia/Seoul"
  );
  return NextResponse.json({ answer, ai_fallback: !aiUsed });
}
