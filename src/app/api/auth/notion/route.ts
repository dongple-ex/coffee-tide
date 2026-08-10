// Notion 연동 — 토큰+DB ID 수동 입력 (phase3 Step 2). 미입력 시 .env 기본값 허용.

import { NextRequest, NextResponse } from "next/server";
import { unauthorized, writeSession } from "@/lib/auth/cookies";
import {
  deleteIntegrationForCurrentUser,
  readSessionWithIntegrations,
  storeIntegrationForCurrentUser,
  writeSessionForCurrentUser,
} from "@/lib/auth/integrationStore";

export async function POST(request: NextRequest) {
  const session = await readSessionWithIntegrations();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    action?: "connect" | "disconnect";
    token?: string;
    dbId?: string;
  };

  const next = { ...session };
  if (body.action === "disconnect") {
    await deleteIntegrationForCurrentUser("notion");
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
    const stored = await storeIntegrationForCurrentUser("notion", {
      notionToken: token,
      notionDbId: dbId,
    });
    if (!stored) return writeSession(NextResponse.json({ success: true }), next);
  }

  return writeSessionForCurrentUser(NextResponse.json({ success: true }), next);
}
