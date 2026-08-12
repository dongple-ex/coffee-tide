"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(max-width: 768px)");
  mql.addEventListener("change", callback);
  return () => {
    mql.removeEventListener("change", callback);
  };
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * 768px 이하 모바일 뷰포트 여부를 useSyncExternalStore와 matchMedia로 반응형 감지하는 전용 훅.
 * SSR 스냅샷은 false로 고정하여 hydration mismatch를 방지합니다.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
