// 완료 처리 write-back — Notion 페이지 상태 / Obsidian 체크박스 (phase5 §2.1)

import { NextRequest, NextResponse } from "next/server";
import { isMockMode } from "@/lib/adapters/factory";
import { NotionAdapter } from "@/lib/adapters/notion";
import { ObsidianAdapter } from "@/lib/adapters/obsidian";
import { readSession, unauthorized } from "@/lib/auth/cookies";

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    source?: "notion" | "obsidian";
  };
  if (!body.id || !body.source) {
    return NextResponse.json({ error: "id와 source가 필요합니다" }, { status: 400 });
  }

  if (isMockMode() || body.id.startsWith("mock-")) {
    return NextResponse.json({ success: true, message: "완료 도장 꾹! (Mock)" });
  }

  try {
    if (body.source === "notion") {
      if (!session.notionToken || !session.notionDbId) {
        return NextResponse.json({ error: "Notion 연동이 필요합니다" }, { status: 400 });
      }
      await new NotionAdapter(session.notionToken, session.notionDbId).completeTask(body.id);
      return NextResponse.json({ success: true, message: "Notion 페이지도 완료로 바꿔뒀어요" });
    }
    if (!session.obsidianVaultPath) {
      return NextResponse.json({ error: "Obsidian 연동이 필요합니다" }, { status: 400 });
    }
    await new ObsidianAdapter(session.obsidianVaultPath).completeTask(body.id);
    return NextResponse.json({ success: true, message: "Obsidian 노트에 체크 표시 해뒀어요" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "완료 처리 실패" },
      { status: 500 }
    );
  }
}
