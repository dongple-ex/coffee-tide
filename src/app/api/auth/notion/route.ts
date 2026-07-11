// Notion 연동 — 토큰+DB ID 수동 입력 (phase3 Step 2). 미입력 시 .env 기본값 허용.

import { NextRequest, NextResponse } from "next/server";
import { readSession, unauthorized, writeSession } from "@/lib/auth/cookies";

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    action?: "connect" | "disconnect";
    token?: string;
    dbId?: string;
  };

  const next = { ...session };
  if (body.action === "disconnect") {
    delete next.notionToken;
    delete next.notionDbId;
  } else {
    const token = body.token?.trim() || process.env.NOTION_INTEGRATION_TOKEN;
    const dbId = body.dbId?.trim() || process.env.NOTION_DATABASE_ID;
    if (!token || !dbId) {
      return NextResponse.json(
        { error: "Notion 토큰과 Database ID가 필요합니다" },
        { status: 400 }
      );
    }
    next.notionToken = token;
    next.notionDbId = dbId;
  }

  return writeSession(NextResponse.json({ success: true }), next);
}
