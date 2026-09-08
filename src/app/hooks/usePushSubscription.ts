"use client";

import { useState, useEffect, useCallback } from "react";
import {
  loadLS,
  saveLS,
  LS_BRIEF_TIME,
} from "@/lib/localStore";
import {
  getNotificationPermission,
  requestNotificationPermission,
} from "@/lib/push/browserNotification";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const view = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return view;
}

export interface UsePushSubscriptionOptions {
  phase: string;
  userScope?: string;
  showToast?: (message: string) => void;
}

/**
 * 웹 푸시 및 브라우저 알림 구독 관리 훅 (K10)
 */
export function usePushSubscription(options: UsePushSubscriptionOptions) {
  const { phase, userScope, showToast } = options;

  const [pushSupported, setPushSupported] = useState<boolean | null>(null);
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(getNotificationPermission);
  const [briefTime, setBriefTime] = useState(() => loadLS<string>(LS_BRIEF_TIME, "08:30"));

  // 브라우저 웹 푸시 지원 여부 & 기존 구독 확인
  useEffect(() => {
    if (phase !== "ready") return;
    void (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushSupported(false);
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        setPushSupported(true);
        if (!subscription) {
          setPushEndpoint(null);
          return;
        }
        // Permission alone is not proof that the server still has this subscription.
        const response = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: subscription.toJSON(),
            briefTime: loadLS(LS_BRIEF_TIME, "08:30"),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        }).catch(() => null);
        setPushEndpoint(response?.ok ? subscription.endpoint : null);
      } catch {
        setPushSupported(false);
      }
    })();
  }, [phase, userScope]);

  const subscribePush = useCallback(async () => {
    if (!pushSupported || !("Notification" in window)) {
      showToast?.("아이폰은 홈 화면에 추가한 CoffeeTide에서 알림을 켜주세요. 지원 브라우저와 알림 권한이 필요합니다.");
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      console.warn("웹 푸시 미설정: NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 환경변수가 필요합니다 (.env.example 참조)");
      showToast?.("이 서버는 아직 알림을 내릴 준비가 안 됐어요 — 관리자에게 문의해 주세요.");
      return;
    }
    setPushBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setNotifPerm(permission);
      if (permission !== "granted") {
        showToast?.("알림 권한이 꺼져 있어요 — 주소창 옆 자물쇠(사이트 설정)에서 허용해 주시면 바로 찾아뵐게요!");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          briefTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `서버가 잠시 말이 없네요 (HTTP ${res.status}). 조금 뒤 다시 시도해 주세요.`);
      setPushEndpoint(subscription.endpoint);
      showToast?.(`브리핑과 AI 작업 완료 알림을 켰습니다. 첫 브리핑은 내일 ${briefTime}에 보내드려요.`);
    } catch (err) {
      showToast?.(
        err instanceof Error && err.message
          ? `앗, 알림벨을 달다 놓쳤어요 (${err.message})`
          : "앗, 알림벨을 달다 놓쳤어요. 잠시 후 다시 시도해 주세요."
      );
    } finally {
      setPushBusy(false);
    }
  }, [pushSupported, briefTime, showToast]);

  const unsubscribePush = useCallback(async () => {
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? pushEndpoint;
      await subscription?.unsubscribe();
      if (endpoint) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setPushEndpoint(null);
      showToast?.("알겠어요, 당분간 조용히 있을게요.");
    } catch {
      showToast?.("앗, 알림을 끄지 못했어요. 잠시 후 다시 눌러주세요.");
    } finally {
      setPushBusy(false);
    }
  }, [pushEndpoint, showToast]);

  const toggleNotification = useCallback(
    async (enable: boolean) => {
      setPushBusy(true);
      try {
        if (enable) {
          if (pushSupported) {
            await subscribePush();
            return;
          }
          const res = await requestNotificationPermission();
          setNotifPerm(res);
          if (res === "granted") {
            if (pushSupported && VAPID_PUBLIC_KEY && !pushEndpoint) {
              try {
                await subscribePush();
              } catch (err) {
                console.warn("Push subscribe error:", err);
              }
            } else {
              showToast?.("데스크톱 알림 권한이 허용되었습니다.");
            }
          } else {
            showToast?.("알림 권한이 거부되어 있습니다. 브라우저 설정에서 허용해주세요.");
          }
        } else {
          if (pushEndpoint) {
            try {
              await unsubscribePush();
            } catch (err) {
              console.warn("Unsubscribe push error:", err);
            }
          }
          setPushEndpoint(null);
          showToast?.("알림을 껐습니다.");
        }
      } catch (err) {
        console.warn("Toggle notification error:", err);
      } finally {
        setPushBusy(false);
      }
    },
    [pushSupported, pushEndpoint, subscribePush, unsubscribePush, showToast]
  );

  const testPush = useCallback(async () => {
    if (!pushEndpoint) return;
    setPushBusy(true);
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: pushEndpoint }),
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      showToast?.(json.message ?? json.error ?? `서버가 잠시 말이 없네요 (HTTP ${res.status}). 조금 뒤 다시 시도해 주세요.`);
    } finally {
      setPushBusy(false);
    }
  }, [pushEndpoint, showToast]);

  const saveBriefTime = useCallback(
    async (next: string) => {
      setBriefTime(next);
      saveLS(LS_BRIEF_TIME, next);
      if (!pushEndpoint) return;
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: subscription.toJSON(),
            briefTime: next,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        if (res.ok) {
          showToast?.(`아침 브리핑 시간을 ${next}으로 변경했습니다.`);
        }
      } catch {
        // 백그라운드 재등록 실패 시 로컬 저장은 유지
      }
    },
    [pushEndpoint, showToast]
  );

  return {
    pushSupported,
    pushEndpoint,
    pushBusy,
    notifPerm,
    briefTime,
    setBriefTime,
    setNotifPerm,
    setPushEndpoint,
    subscribePush,
    unsubscribePush,
    toggleNotification,
    testPush,
    saveBriefTime,
  };
}
