"use client";

import React, { useState, useEffect } from "react";
import IcedAmericano from "./icedAmericano";
import styles from "../page.module.css";

export type Theme = "dark" | "light" | "coffee" | "notebook" | "mega" | "kustom";

export interface HeaderControlsProps {
  onLogoutHandoff: () => void;
  showConn: boolean;
  onToggleConn: () => void;
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
}: HeaderControlsProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

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
            <IcedAmericano size={26} /> coffee<span>Tide</span>
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
          <button
            className={styles.connMenuBtn}
            onClick={onToggleConn}
            aria-expanded={showConn}
            aria-haspopup="dialog"
            aria-label="설정 열기/닫기"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 14 4-4" />
              <path d="M3.34 19a10 10 0 1 1 17.32 0" />
            </svg>
            설정
          </button>
          <button className={styles.logoutBtnSmall} onClick={onLogoutHandoff}>
            퇴근하기
          </button>
        </div>
      </div>
    </header>
  );
}
