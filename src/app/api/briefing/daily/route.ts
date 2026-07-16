// 브리핑 발송 트리거 — 클라우드 배포용 외부 크론 엔드포인트 (Vercel Cron 등).
// 셀프호스팅은 instrumentation.ts의 내장 스케줄러가 같은 로직을 60초마다 실행한다
// (이 라우트를 쓰지 않으므로 CRON_SECRET 없이도 셀프호스팅은 정상 동작).
// 공개 경로라 CRON_SECRET을 필수로 요구한다 — 미설정 배포가 인터넷에 열리는 사고 방지.
// Vercel은 CRON_SECRET 환경변수가 있으면 크론 호출에 Authorization: Bearer를 자동으로 붙인다.

import { NextRequest, NextResponse } from "next/server";
import { sendDueBriefings } from "@/lib/push/sender";

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[coffeeTide] /api/briefing/daily 호출 거부 — CRON_SECRET 미설정 (.env.example 참조)");
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
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
