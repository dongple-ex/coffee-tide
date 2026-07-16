// 테스트 발송 — 저장된 스냅샷으로 즉시 브리핑 알림 1건 발송

import { NextRequest, NextResponse } from "next/server";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { buildBriefingPayload, isPushConfigured, sendPush } from "@/lib/push/sender";
import { getProfile } from "@/lib/push/store";

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  if (!isPushConfigured()) {
    console.warn("웹 푸시 미설정: VAPID 키 환경변수 누락 (.env.example 참조)");
    return NextResponse.json(
      { error: "이 서버는 아직 알림을 내릴 준비가 안 됐어요 — 관리자에게 문의해 주세요." },
      { status: 501 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint가 필요합니다" }, { status: 400 });
  }
  const profile = await getProfile(body.endpoint);
  if (!profile) {
    return NextResponse.json({ error: "구독 정보를 찾을 수 없습니다. 알림을 다시 켜주세요." }, { status: 404 });
  }

  const ok = await sendPush(profile, buildBriefingPayload(profile.items, profile.timezone));
  return ok
    ? NextResponse.json({ success: true, message: "테스트 알림 발사! 안 보이면 브라우저 알림 권한을 확인해 주세요." })
    : NextResponse.json({ error: "앗, 발송이 튕겼어요. 알림을 껐다 다시 켜보시겠어요?" }, { status: 500 });
}
