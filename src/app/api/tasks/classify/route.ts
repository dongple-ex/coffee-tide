// 단건/소량 분류 — 수동 입력(manual) 항목 생성 시 분류·행동지침 부여 (G1)

import { NextRequest, NextResponse } from "next/server";
import { classifyTasks } from "@/lib/ai/gemini";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { UnifiedData } from "@/lib/types/unified";

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { items?: UnifiedData[] };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items가 필요합니다" }, { status: 400 });
  }

  const { items } = await classifyTasks(body.items.slice(0, 20));
  return NextResponse.json({ items });
}
