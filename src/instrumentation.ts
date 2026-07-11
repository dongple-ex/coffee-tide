// Next.js instrumentation — 서버 기동 시 1회 실행 (Node 런타임에서만)

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBriefingScheduler } = await import("./lib/push/scheduler");
    startBriefingScheduler();
  }
}
