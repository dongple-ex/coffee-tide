// 브리핑 발송 트리거 — 클라우드 배포용 외부 크론 엔드포인트 (Vercel Cron 등).
// 셀프호스팅은 instrumentation.ts의 내장 스케줄러가 같은 로직을 60초마다 실행한다.
// CRON_SECRET이 설정돼 있으면 Authorization: Bearer 검증(공개 경로이므로).

import { NextRequest, NextResponse } from "next/server";
import { sendDueBriefings } from "@/lib/push/sender";

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await sendDueBriefings();
  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
