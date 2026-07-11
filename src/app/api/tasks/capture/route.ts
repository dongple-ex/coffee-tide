// 빠른 캡처 — 항목을 Notion DB 페이지 또는 Obsidian 수집함으로 저장 (as-built §5)

import { NextRequest, NextResponse } from "next/server";
import { isMockMode } from "@/lib/adapters/factory";
import { NotionAdapter } from "@/lib/adapters/notion";
import { ObsidianAdapter } from "@/lib/adapters/obsidian";
import { readSession, unauthorized } from "@/lib/auth/cookies";

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    target?: "notion" | "obsidian";
    title?: string;
    content?: string;
  };
  if (!body.target || !body.title?.trim()) {
    return NextResponse.json({ error: "target과 title이 필요합니다" }, { status: 400 });
  }

  if (isMockMode()) {
    return NextResponse.json({ success: true, message: `캡처 완료! (Mock → ${body.target})` });
  }

  try {
    if (body.target === "notion") {
      if (!session.notionToken || !session.notionDbId) {
        return NextResponse.json({ error: "Notion 연동이 필요합니다" }, { status: 400 });
      }
      const url = await new NotionAdapter(session.notionToken, session.notionDbId).createTask(
        body.title.trim(),
        body.content
      );
      return NextResponse.json({ success: true, message: "Notion에 살포시 저장해뒀어요", url });
    }
    if (!session.obsidianVaultPath) {
      return NextResponse.json({ error: "Obsidian 연동이 필요합니다" }, { status: 400 });
    }
    const note = await new ObsidianAdapter(session.obsidianVaultPath).captureTask(
      body.title.trim(),
      body.content
    );
    return NextResponse.json({ success: true, message: `Obsidian '${note}'에 적어뒀어요` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "캡처 실패" },
      { status: 500 }
    );
  }
}
