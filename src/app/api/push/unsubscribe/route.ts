// NOTE: 푸시 endpoint는 세션과 소유권을 묶지 않는다 (의도된 설계).
// endpoint 자체가 브라우저 푸시 서비스가 발급한 고엔트로피 비밀 URL(capability)이고,
// 세션 identity는 모든 게스트가 공유(guest@)라 묶을 주체가 없으며, 세션 ID에 묶으면
// 7일 만료 후 재입장한 사용자가 자기 구독을 해제/동기화하지 못하게 된다.

import { NextRequest, NextResponse } from "next/server";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { removeProfile } from "@/lib/push/store";

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint가 필요합니다" }, { status: 400 });
  }
  try {
    await removeProfile(body.endpoint);
  } catch (err) {
    console.error("[coffeeTide] 푸시 구독 해제 실패:", err);
    return NextResponse.json(
      { error: (err as Error).message || "구독 해제에 실패했습니다" },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}
