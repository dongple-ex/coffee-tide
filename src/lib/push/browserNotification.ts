// 브라우저 데스크톱 알림 (Notification API) 유틸리티 — 백로그 H4.
// 방치된 업무(팔로업 초과) 및 신규 긴급(urgent) 업무 실시간 알림 발송.

import { ProcessedData } from "../automation/rules";

const LS_NOTIFIED_IDS = "ct_notified_item_ids";

function getNotifiedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LS_NOTIFIED_IDS);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveNotifiedIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    // 최대 200개 까지만 보존하여 메모리/localStorage 보호
    const arr = Array.from(ids).slice(-200);
    localStorage.setItem(LS_NOTIFIED_IDS, JSON.stringify(arr));
  } catch {
    // 무시
  }
}

/** 브라우저 Notification API 지원 여부 */
export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** 브라우저 알림 권한 동의 여부 */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return "denied";
  return Notification.permission;
}

/** 브라우저 알림 권한 요청 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return "denied";
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn("[coffeeTide] Notification permission request error:", err);
    return "denied";
  }
}

/** 업무 상태(긴급/방치)를 감지하여 데스크톱 알림 팝업 발송 */
export function triggerTaskNotifications(items: ProcessedData[], followupHours = 24): void {
  if (!isNotificationSupported() || Notification.permission !== "granted") return;

  const notified = getNotifiedIds();
  const now = Date.now();
  let updated = false;

  for (const item of items) {
    if (item.status === "completed" || item.status === "dismissed") continue;

    const diffHours = (now - Date.parse(item.created_at)) / (1000 * 60 * 60);
    const isOverdue = diffHours >= followupHours;
    const isUrgent = item.category === "urgent";

    if (!isOverdue && !isUrgent) continue;

    const notifyKey = `${item.id}:${isUrgent ? "urgent" : "overdue"}`;
    if (notified.has(notifyKey)) continue;

    const title = isUrgent
      ? `🚨 [긴급 업무] ${item.title}`
      : `⏰ [팔로업 알림] ${item.title}`;

    const body = isUrgent
      ? `즉각적인 조치가 필요한 긴급 업무가 도착했습니다. (출처: ${item.source})`
      : `${Math.floor(diffHours)}시간째 처리되지 않은 업무입니다. 클릭하여 확인하세요.`;

    try {
      const notification = new Notification(title, {
        body,
        icon: "/icon.svg",
        tag: notifyKey,
      });

      notification.onclick = () => {
        if (typeof window !== "undefined") {
          window.focus();
        }
        notification.close();
      };

      notified.add(notifyKey);
      updated = true;
    } catch (err) {
      console.warn("[coffeeTide] Notification popup failed:", err);
    }
  }

  if (updated) {
    saveNotifiedIds(notified);
  }
}
