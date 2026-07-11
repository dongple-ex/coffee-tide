// 붙여넣기 가져오기 — 메모/메일/회의록 텍스트에서 업무 추출 (G1 paste 경로).
// 추출 결과는 클라이언트가 localStorage에 저장하는 1급 'paste' 소스가 된다.

import { NextRequest, NextResponse } from "next/server";
import { classifyTasks, extractTasks } from "@/lib/ai/gemini";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { UnifiedData } from "@/lib/types/unified";

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text가 필요합니다" }, { status: 400 });
  }

  const extracted = await extractTasks(text);
  const now = Date.now();
  const items: UnifiedData[] = extracted.map((t, i) => ({
    id: `paste-${now}-${i}`,
    source: "paste",
    title: t.title,
    content: t.content,
    created_at: new Date().toISOString(),
    author: { name: session.userEmail },
    url: "",
    status: "pending",
  }));

  const { items: classified } = await classifyTasks(items);
  return NextResponse.json({ tasks: classified });
}
