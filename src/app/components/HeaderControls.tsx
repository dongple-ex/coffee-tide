"use client";

import React from "react";
import IcedAmericano from "./icedAmericano";
import { ConnectionState } from "@/lib/types/unified";
import { ViewWindowSetting, WINDOW_TIERS_DAYS } from "@/lib/collectWindow";
import styles from "../page.module.css";

export type Theme = "dark" | "light" | "coffee" | "notebook" | "mega" | "kustom";

export interface HeaderControlsProps {
  userEmail?: string;
  connections?: ConnectionState;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onLogoutHandoff: () => void;
  showConn: boolean;
  onToggleConn: () => void;
  compactMode: boolean;
  onToggleCompactMode: () => void;
  followupHours: number;
  onFollowupHoursChange: (hours: number) => void;
  viewWindow: ViewWindowSetting;
  onViewWindowChange: (val: ViewWindowSetting) => void;
  fetchLimit: number;
  onFetchLimitChange: (limit: number) => void;
  notifPerm: NotificationPermission;
  onRequestNotifPerm: () => void;
}

export function HeaderControls({
  userEmail,
  connections,
  theme,
  onThemeChange,
  onLogoutHandoff,
  showConn,
  onToggleConn,
  compactMode,
  onToggleCompactMode,
  followupHours,
  onFollowupHoursChange,
  viewWindow,
  onViewWindowChange,
  fetchLimit,
  onFetchLimitChange,
}: HeaderControlsProps) {
  const displayEmail = userEmail || connections?.googleEmail || connections?.outlookEmail || "게스트";

  return (
    <header className={styles.header}>
      {/* Row 1: Logo & Profile/Theme Actions */}
      <div className={styles.headerRow}>
        <div className={styles.headerGroupLeft}>
          <div className={styles.logo}>
            <IcedAmericano size={26} /> coffee<span>Tide</span>
          </div>
        </div>

        <div className={styles.headerActionsRight}>
          <span className={styles.userEmail} title={displayEmail}>
            {displayEmail}
          </span>
          <select
            className={`${styles.input} ${styles.selectCompact}`}
            style={{ width: "auto", padding: "2px 6px" }}
            value={theme}
            onChange={(e) => onThemeChange(e.target.value as Theme)}
            aria-label="테마 선택"
          >
            <option value="dark">🌙 다크</option>
            <option value="light">☀️ 라이트</option>
            <option value="notebook">🥤 커피타이드</option>
            <option value="coffee">☕ 에스프레소</option>
            <option value="mega">💛 메가커피</option>
            <option value="kustom">💙 커스텀커피</option>
          </select>
          <button className={styles.logoutBtnSmall} onClick={onLogoutHandoff}>
            퇴근하기
          </button>
        </div>
      </div>

      {/* Row 2: Compact 1-Line Control Toolbar */}
      <div className={styles.headerToolbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            className={styles.connMenuBtn}
            style={{ padding: "3px 8px", fontSize: "0.76rem", borderRadius: "6px" }}
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

          <button
            className={`${styles.connMenuBtn} ${compactMode ? styles.compactModeActiveBtn : ""}`}
            style={{ padding: "3px 8px", fontSize: "0.76rem", borderRadius: "6px" }}
            onClick={onToggleCompactMode}
            aria-pressed={compactMode}
            title={compactMode ? "일반 뷰로 전환" : "한눈에 보기 / 모바일 미니 대시보드 축소 모드"}
            aria-label={compactMode ? "일반 뷰로 전환" : "축소 모드로 전환"}
          >
            <span style={{ fontSize: "0.85rem", lineHeight: 1 }}>{compactMode ? "⤢" : "🗗"}</span>
            <span>{compactMode ? "일반 뷰" : "축소 모드"}</span>
          </button>
        </div>

        <div className={styles.headerToolbarGroup}>
          <label className={styles.headerSelectLabel}>
            <span>팔로업</span>
            <select
              className={styles.headerSelect}
              value={followupHours}
              onChange={(e) => onFollowupHoursChange(Number(e.target.value))}
              aria-label="팔로업 에스컬레이션 기준 시간"
            >
              <option value={12}>12시간</option>
              <option value={24}>24시간</option>
              <option value={48}>48시간</option>
            </select>
          </label>

          <label className={styles.headerSelectLabel}>
            <span>표시</span>
            <select
              className={styles.headerSelect}
              value={String(viewWindow)}
              onChange={(e) =>
                onViewWindowChange(e.target.value === "auto" ? "auto" : Number(e.target.value))
              }
              aria-label="외부 항목 표시 기간"
            >
              <option value="auto">자동</option>
              {WINDOW_TIERS_DAYS.map((d) => (
                <option key={d} value={d}>
                  최근 {d}일
                </option>
              ))}
            </select>
          </label>

          <label className={styles.headerSelectLabel}>
            <span>수집</span>
            <select
              className={styles.headerSelect}
              value={fetchLimit}
              onChange={(e) => onFetchLimitChange(Number(e.target.value))}
              aria-label="채널별 수집 건수 상한"
            >
              <option value={10}>10건</option>
              <option value={20}>20건</option>
              <option value={50}>50건</option>
            </select>
          </label>
        </div>
      </div>
    </header>
  );
}
