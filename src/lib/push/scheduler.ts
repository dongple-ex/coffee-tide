// 셀프호스팅용 브리핑 스케줄러 — instrumentation.ts에서 서버 기동 시 1회 시작.
// 클라우드(Vercel) 배포에서는 대신 외부 크론이 /api/briefing/daily 를 호출한다.

import { isPushConfigured, sendDueBriefings } from "./sender";

const globalState = globalThis as typeof globalThis & {
  __coffeetideBriefingTimer?: ReturnType<typeof setInterval>;
};

export function startBriefingScheduler(): void {
  if (globalState.__coffeetideBriefingTimer) return;
  if (!isPushConfigured()) {
    console.log("[coffeeTide] VAPID 키 미설정 — 브리핑 스케줄러 비활성");
    return;
  }
  globalState.__coffeetideBriefingTimer = setInterval(() => {
    sendDueBriefings().catch((err) =>
      console.warn("[coffeeTide] 브리핑 스케줄러 오류:", err)
    );
  }, 60_000);
  console.log("[coffeeTide] 아침 브리핑 스케줄러 시작 (60초 주기)");
}
