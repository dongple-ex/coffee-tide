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
