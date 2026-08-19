import { NextResponse } from "next/server";
import { sendDueBriefings } from "@/lib/push/sender";

// Vercel Cron 등의 스케줄러가 이 엔드포인트를 주기적(예: 매분)으로 호출합니다.
export async function GET(request: Request) {
  // 인증 처리: Authorization 헤더에 CRON_SECRET이 있는지 확인 (운영 환경 보안)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendDueBriefings();
    return NextResponse.json({
      success: true,
      message: "Background brief check completed",
      ...result,
    });
  } catch (error) {
    console.error("[Cron Error]", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
