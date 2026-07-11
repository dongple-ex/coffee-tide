// 업무 스냅샷 동기화 — 클라이언트가 병합한 활성 목록을 프로필에 저장.
// 세션(쿠키) 없이는 서버가 manual/paste에 접근할 수 없으므로, 스케줄 발송의 데이터 소스가 된다.

import { NextRequest, NextResponse } from "next/server";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { UnifiedData } from "@/lib/types/unified";
import { updateProfile } from "@/lib/push/store";

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    endpoint?: string;
    items?: UnifiedData[];
  };
  if (!body.endpoint || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "endpoint와 items가 필요합니다" }, { status: 400 });
  }

  const slim = body.items.slice(0, 50).map((i) => ({
    ...i,
    content: (i.content || "").slice(0, 200),
  }));
  const found = await updateProfile(body.endpoint, { items: slim });
  return NextResponse.json({ success: found });
}
