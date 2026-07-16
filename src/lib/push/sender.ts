// 웹 푸시 발송 + 아침 브리핑 due 판정 — 백로그 H5.
// 알림 본문은 저장된 스냅샷에서 결정적으로 생성(AI 의존 없음) — 클릭하면 대시보드에서 전체 브리핑.

import webpush from "web-push";
import { UnifiedCategory } from "../types/unified";
import { BriefingItem, PushProfile, listProfiles, removeProfile, updateProfile } from "./store";

export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidReady = false;
function ensureVapid(): void {
  if (vapidReady) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@coffeetide.dongple.kr",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  vapidReady = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

const CATEGORY_RANK: Record<UnifiedCategory, number> = {
  urgent: 0,
  approval_required: 1,
  action_required: 2,
  meeting: 3,
  reference: 4,
  ignore: 5,
};

export function buildBriefingPayload(items: BriefingItem[], timezone: string): PushPayload {
  const active = items.filter((i) => i.status !== "completed" && i.status !== "dismissed");
  const sorted = [...active].sort(
    (a, b) =>
      (CATEGORY_RANK[a.category ?? "reference"] ?? 4) -
      (CATEGORY_RANK[b.category ?? "reference"] ?? 4)
  );
  const urgentCount = active.filter((i) => i.category === "urgent").length;
  const dateLabel = new Date().toLocaleDateString("ko-KR", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });

  const body =
    active.length === 0
      ? "대기 중인 업무가 없어요. 아아 한 잔과 여유로운 하루 보내세요 🥤"
      : [
          `대기 ${active.length}건${urgentCount > 0 ? ` · 긴급 ${urgentCount}건` : ""}`,
          ...sorted
            .slice(0, 3)
            .map(
              (i, n) => `${n + 1}. ${i.category === "urgent" ? "[긴급] " : ""}${i.title}`
            ),
        ].join("\n");

  return { title: `🥤 오늘의 브리핑 (${dateLabel})`, body, url: "/" };
}

export type PushSendResult = "sent" | "gone" | "permanent" | "transient";

/** 발송. 구독이 만료(404/410)면 프로필 자동 제거. 그 외 4xx는 영구, 5xx/네트워크는 일시 실패로 분류. */
export async function sendPush(profile: PushProfile, payload: PushPayload): Promise<PushSendResult> {
  ensureVapid();
  try {
    await webpush.sendNotification(profile.subscription, JSON.stringify(payload), {
      TTL: 3600,
    });
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await removeProfile(profile.endpoint);
      console.warn("[coffeeTide] 만료된 푸시 구독 제거:", profile.endpoint.slice(0, 60));
      return "gone";
    }
    console.warn("[coffeeTide] 푸시 발송 실패:", status, (err as Error).message);
    return status && status >= 400 && status < 500 ? "permanent" : "transient";
  }
}

/** 매분 호출 — 각 프로필의 타임존 기준으로 브리핑 시각이 지났고 오늘 미발송이면 발송 */
export async function sendDueBriefings(): Promise<{ checked: number; sent: number }> {
  if (!isPushConfigured()) return { checked: 0, sent: 0 };

  const profiles = await listProfiles();
  const now = new Date();
  let sent = 0;

  for (const profile of profiles) {
    const tz = profile.timezone || "Asia/Seoul";
    const hhmm = now.toLocaleTimeString("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const today = now.toLocaleDateString("en-CA", { timeZone: tz });

    if (hhmm >= profile.briefTime && profile.lastSentDate !== today) {
      const result = await sendPush(profile, buildBriefingPayload(profile.items, tz));
      if (result === "sent") {
        await updateProfile(profile.endpoint, { lastSentDate: today });
        sent++;
      } else if (result === "permanent") {
        // 영구 실패(4xx — 예: VAPID 키 교체 후 403)는 당일 1회로 제한해 무한 재시도를 막는다
        await updateProfile(profile.endpoint, { lastSentDate: today });
      }
      // transient(5xx/네트워크)는 기록하지 않는다 — 다음 틱(60초)에 자동 재시도.
      // gone(404/410)은 sendPush가 프로필을 이미 제거했으므로 재시도 루프가 생기지 않는다.
    }
  }
  return { checked: profiles.length, sent };
}
