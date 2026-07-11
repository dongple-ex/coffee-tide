// 푸시 구독 등록/설정 변경 — 백로그 H5.
// 등록 당일은 발송 스킵(lastSentDate=오늘)하고, 즉시 확인은 /api/push/test 사용.

import { NextRequest, NextResponse } from "next/server";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { isPushConfigured } from "@/lib/push/sender";
import { StoredSubscription, getProfile, upsertProfile } from "@/lib/push/store";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "서버에 VAPID 키가 설정되지 않았습니다 (.env의 VAPID_* 변수, npx web-push generate-vapid-keys)" },
      { status: 501 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    subscription?: StoredSubscription;
    briefTime?: string;
    timezone?: string;
  };
  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "유효한 구독 정보가 필요합니다" }, { status: 400 });
  }
  const briefTime = TIME_RE.test(body.briefTime ?? "") ? body.briefTime! : "08:30";
  const timezone = body.timezone || "Asia/Seoul";

  const existing = await getProfile(sub.endpoint);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone });

  await upsertProfile({
    endpoint: sub.endpoint,
    subscription: sub,
    briefTime,
    timezone,
    items: existing?.items ?? [],
    lastSentDate: existing?.lastSentDate ?? today,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });

  return NextResponse.json({ success: true, briefTime, timezone });
}
