import { NextRequest, NextResponse } from "next/server";
import { parseRule } from "@/lib/ai/gemini";
import { readSession, unauthorized } from "@/lib/auth/cookies";

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { text?: string };
  if (!body.text?.trim()) {
    return NextResponse.json({ error: "text가 필요합니다" }, { status: 400 });
  }

  const rule = await parseRule(body.text.trim());
  if (!rule) {
    return NextResponse.json(
      { error: "음… 규칙으로 못 알아들었어요. 이렇게 말해보세요: '제목에 긴급 있으면 맨 위로'" },
      { status: 422 }
    );
  }
  return NextResponse.json({ rule });
}
