"use client";

import React from "react";
import IcedAmericano from "./icedAmericano";
import { ConnectionState } from "@/lib/types/unified";
import { ViewWindowSetting, WINDOW_TIERS_DAYS } from "@/lib/collectWindow";
import styles from "../page.module.css";

export type Theme = "dark" | "light" | "coffee" | "mega" | "kustom";

export interface HeaderControlsProps {
  userEmail?: string;
  connections?: ConnectionState;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onLogoutHandoff: () => void;
  activeCount: number;
  urgentCount: number;
  doneCount: number;
  isDataRefreshing: boolean;
  onRefreshAll: () => void;
  showConn: boolean;
  onToggleConn: () => void;
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
  activeCount,
  urgentCount,
  doneCount,
  isDataRefreshing,
  onRefreshAll,
  showConn,
  onToggleConn,
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
      {/* Row 1: Logo, Stats & Profile/Theme Actions */}
      <div className={styles.headerRow}>
        <div className={styles.headerGroupLeft}>
          <div className={styles.logo}>
            <IcedAmericano size={26} /> coffee<span>Tide</span>
          </div>
          <div className={styles.stats}>
            <span className={styles.statChip}>
              대기 <b>{activeCount}</b>
            </span>
            <span className={styles.statChip}>
              긴급 <b>{urgentCount}</b>
            </span>
            <span className={styles.statChip}>
              오늘 완료 <b>{doneCount}</b>
            </span>
          </div>
          <button
            className={styles.refreshBtn}
            onClick={onRefreshAll}
            disabled={isDataRefreshing}
            aria-label="연결 데이터 새로고침"
            title="연결 데이터 새로고침"
          >
            <svg
              className={isDataRefreshing ? styles.spinIcon : ""}
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6" />
              <path d="M2 11.5a10 10 0 1 1 18.8-4.3L21.5 8M22 12.5a10 10 0 0 1-18.8 4.3L2.5 16" />
            </svg>
          </button>
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
            <option value="coffee">🥤 커피타이드</option>
            <option value="mega">💛 메가커피</option>
            <option value="kustom">💙 커스텀커피</option>
          </select>
          <button className={styles.logoutBtnSmall} onClick={onLogoutHandoff}>
            퇴근하기
          </button>
        </div>
      </div>

      {/* Row 2: Unified Control Toolbar */}
      <div className={styles.headerToolbar}>
        <div className={styles.headerToolbarGroup}>
          <button
            className={styles.connMenuBtn}
            onClick={onToggleConn}
            aria-expanded={showConn}
            aria-haspopup="dialog"
            aria-label="설정 열기/닫기"
          >
            <svg
              width="16"
              height="16"
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
        </div>

        <div className={styles.headerToolbarGroup}>
          <label className={styles.headerSelectLabel}>
            <span>팔로업 기준</span>
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
            <span>표시 기간</span>
            <select
              className={styles.headerSelect}
              value={String(viewWindow)}
              onChange={(e) =>
                onViewWindowChange(e.target.value === "auto" ? "auto" : Number(e.target.value))
              }
              aria-label="외부 항목 표시 기간"
            >
              <option value="auto">자동 (건수 차등)</option>
              {WINDOW_TIERS_DAYS.map((d) => (
                <option key={d} value={d}>
                  최근 {d}일
                </option>
              ))}
            </select>
          </label>
          <label className={styles.headerSelectLabel}>
            <span>수집 건수</span>
            <select
              className={styles.headerSelect}
              value={fetchLimit}
              onChange={(e) => onFetchLimitChange(Number(e.target.value))}
              aria-label="채널별 수집 건수 상한"
            >
              <option value={10}>10건</option>
              <option value={20}>20건 (기본)</option>
              <option value={50}>50건</option>
            </select>
          </label>
        </div>
      </div>
    </header>
  );
}
