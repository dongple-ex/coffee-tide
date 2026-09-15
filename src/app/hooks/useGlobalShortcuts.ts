"use client";

import { useEffect } from "react";
import {
  GlobalShortcutsOptions,
  bindGlobalShortcuts,
} from "@/lib/ui/shortcuts";

export type { GlobalShortcutsOptions };

export interface UseGlobalShortcutsProps extends GlobalShortcutsOptions {
  /** 훅 활성화 여부 (기본값: true) */
  enabled?: boolean;
  additionalWindow?: Window | null;
}

/**
 * Antigravity 2.13.0 스타일의 전역 생산성 단축키 훅
 * - Ctrl/Cmd + L or I: 드래그한 텍스트를 AI 바리스타에 인용 주입
 * - Ctrl/Cmd + D: 대화형 확인/승인/질문 취소
 * - Ctrl/Cmd + Enter: 대화형 확인/승인 실행
 * - Escape: 모달/패널 닫기 또는 최소화
 */
export function useGlobalShortcuts({
  onQuoteText,
  onCancelInteractive,
  onSubmitInteractive,
  onEscape,
  enabled = true,
  additionalWindow,
}: UseGlobalShortcutsProps) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const options = { onQuoteText, onCancelInteractive, onSubmitInteractive, onEscape };
    const targets = new Set([window, additionalWindow].filter((target): target is Window => Boolean(target)));
    const cleanups = [...targets].map((target) => bindGlobalShortcuts(target, options));
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [enabled, additionalWindow, onQuoteText, onCancelInteractive, onSubmitInteractive, onEscape]);
}
