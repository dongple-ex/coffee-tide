"use client";

import React, { useState, useEffect } from "react";
import IcedAmericano from "./icedAmericano";
import { UiIcon } from "./UiIcon";
import { useHasUnseenUpdate } from "@/lib/appVersion";
import styles from "../page.module.css";

export type Theme = "dark" | "light" | "simple" | "notebook" | "coffee" | "mega" | "kustom";

export interface HeaderControlsProps {
  onLogoutHandoff: () => void;
  showConn: boolean;
  onToggleConn: () => void;
  onToggleCanvas?: () => void;
  isCanvasOpen?: boolean;
  canvasEnabled?: boolean;
  onOpenArchive?: () => void;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export function HeaderControls({
  onLogoutHandoff,
  showConn,
  onToggleConn,
  onToggleCanvas,
  isCanvasOpen,
  canvasEnabled = true,
  onOpenArchive,
}: HeaderControlsProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const hasUpdate = useHasUnseenUpdate();

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      // beforeinstallprompt 이벤트는 한 번만 사용할 수 있으므로 수락/거절과 관계없이 폐기한다.
      setDeferredPrompt(null);
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.headerRow}>
        <div className={styles.headerGroupLeft}>
          <div className={styles.logo}>
            <IcedAmericano size={30} textMode="lid" /> coffee<span>Tide</span>
          </div>
        </div>

        <div className={styles.headerActionsRight}>
          {deferredPrompt && (
            <button
              className={styles.logoutBtnSmall}
              style={{ backgroundColor: "var(--accent)", color: "#fff", borderColor: "transparent" }}
              onClick={handleInstallClick}
              title="독립된 창과 백그라운드 푸시 알림을 지원하는 크롬 앱(PWA) 설치"
            >
              앱 설치
            </button>
          )}
          {canvasEnabled && onToggleCanvas && (
            <button
              className={`${styles.connMenuBtn} ${isCanvasOpen ? styles.settingsTabBtnActive : ""}`}
              onClick={onToggleCanvas}
              title="AI 캔버스 작업 공간 열기/닫기"
              aria-label="AI 캔버스 열기/닫기"
            >
              <UiIcon name="assistant" size={14} />
              캔버스
            </button>
          )}
          {onOpenArchive && (
            <button
              className={styles.connMenuBtn}
              onClick={onOpenArchive}
              title="완료 문서 아카이브 검색"
              aria-label="완료 문서 아카이브 열기"
            >
              🗃 아카이브
            </button>
          )}
          <button
            className={styles.connMenuBtn}
            onClick={onToggleConn}
            aria-expanded={showConn}
            aria-haspopup="dialog"
            aria-label="설정 열기/닫기"
            title={hasUpdate ? "새로운 업데이트가 있습니다" : undefined}
          >
            <UiIcon name="settings" size={14} />
            설정
            {hasUpdate && <span className={styles.headerUpdateDot} aria-label="새 버전 업데이트 있음" />}
          </button>
          <button className={styles.logoutBtnSmall} onClick={onLogoutHandoff}>
            퇴근하기
          </button>
        </div>
      </div>
    </header>
  );
}
