"use client";

import React from "react";
import type { DataStorageStatus } from "@/lib/types/storage";
import styles from "../../page.module.css";

interface Props {
  storageStatus: DataStorageStatus;
  onRetrySync?: () => void;
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return "기록 없음";
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 10) return "방금 전";
  if (diffSec < 60) return `${diffSec}초 전`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return new Date(isoString).toLocaleDateString("ko-KR");
}

export function DataStorageSection({ storageStatus, onRetrySync }: Props) {
  const {
    cloudProvider,
    syncState,
    lastSyncedAt,
    driveConnected,
    driveBackupEnabled,
    rawLocalStorageEnabled,
    errorMessage,
  } = storageStatus;

  const isGuest = cloudProvider === "guest" || syncState === "guest";
  const isError = syncState === "error";
  const isSyncing = syncState === "syncing";
  const isOffline = syncState === "offline";

  return (
    <div className={styles.card} style={{ marginBottom: 16 }}>
      <div className={styles.cardTitle} style={{ fontSize: "0.9rem", marginBottom: 12 }}>
        데이터 및 보관 상태
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* 1. 구조화 데이터 정본 */}
        <div className={styles.settingToggleRow} style={{ alignItems: "flex-start" }}>
          <div className={styles.settingToggleCopy}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span className={styles.settingToggleTitle}>구조화 데이터 정본</span>
              <span
                className={`${styles.connStatus} ${
                  isError
                    ? styles.connErr
                    : isSyncing || isOffline
                    ? styles.connOn
                    : isGuest
                    ? ""
                    : styles.connOn
                }`}
                style={{ fontSize: "0.72rem", padding: "1px 6px" }}
              >
                {isError
                  ? "동기화 오류"
                  : isOffline
                  ? "오프라인 (로컬 보존)"
                  : isSyncing
                  ? "동기화 중…"
                  : isGuest
                  ? "게스트 (로컬 전용)"
                  : `${cloudProvider === "supabase" ? "Supabase" : "클라우드"} 동기화됨`}
              </span>
            </div>
            <div className={styles.settingToggleDesc} style={{ fontSize: "0.78rem" }}>
              {isGuest ? (
                <span style={{ color: "var(--color-warning, #eab308)" }}>
                  ⚠️ 로그인하지 않은 상태입니다. 브라우저 데이터를 삭제하면 업무가 사라질 수 있습니다.
                </span>
              ) : isError ? (
                <span style={{ color: "var(--color-danger, #ef4444)" }}>
                  {errorMessage || "동기화 실패"}{" "}
                  {lastSyncedAt && `(마지막 성공: ${formatRelativeTime(lastSyncedAt)})`}
                </span>
              ) : (
                `업무·태그·상태를 안전하게 저장합니다. (마지막 동기화: ${formatRelativeTime(lastSyncedAt)})`
              )}
            </div>
          </div>
          {isError && onRetrySync && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              style={{ fontSize: "0.75rem", padding: "4px 8px", whiteSpace: "nowrap" }}
              onClick={onRetrySync}
            >
              재시도
            </button>
          )}
        </div>

        {/* 2. 기기 로컬 캐시 */}
        <div className={styles.settingToggleRow}>
          <div className={styles.settingToggleCopy}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span className={styles.settingToggleTitle}>기기 로컬 캐시</span>
              <span className={`${styles.connStatus} ${styles.connOn}`} style={{ fontSize: "0.72rem", padding: "1px 6px" }}>
                보관 중
              </span>
            </div>
            <div className={styles.settingToggleDesc} style={{ fontSize: "0.78rem" }}>
              오프라인 작업 및 빠른 화면 전환을 위해 브라우저에 임시 보관합니다.
            </div>
          </div>
        </div>

        {/* 3. Google Drive 백업 상태 */}
        <div className={styles.settingToggleRow}>
          <div className={styles.settingToggleCopy}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span className={styles.settingToggleTitle}>Google Drive 원문 백업</span>
              <span
                className={`${styles.connStatus} ${
                  driveConnected && driveBackupEnabled ? styles.connOn : ""
                }`}
                style={{ fontSize: "0.72rem", padding: "1px 6px" }}
              >
                {!driveConnected
                  ? "Google 미연동"
                  : driveBackupEnabled
                  ? "자동 백업 켜짐"
                  : "자동 백업 꺼짐"}
              </span>
            </div>
            <div className={styles.settingToggleDesc} style={{ fontSize: "0.78rem" }}>
              {driveConnected && driveBackupEnabled
                ? "`CoffeeTide/YYYY-MM-DD/` 일자별 폴더에 회의록/메모 원문 마크다운을 백업합니다."
                : "Google 연동 및 Drive 백업 설정을 켜면 원문 마크다운이 Drive에 자동 보관됩니다."}
            </div>
          </div>
        </div>

        {/* 4. 원문 로컬 보관 상태 */}
        <div className={styles.settingToggleRow}>
          <div className={styles.settingToggleCopy}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span className={styles.settingToggleTitle}>PC 로컬 원문 보관</span>
              <span
                className={`${styles.connStatus} ${rawLocalStorageEnabled ? styles.connOn : ""}`}
                style={{ fontSize: "0.72rem", padding: "1px 6px" }}
              >
                {rawLocalStorageEnabled ? "켜짐" : "꺼짐"}
              </span>
            </div>
            <div className={styles.settingToggleDesc} style={{ fontSize: "0.78rem" }}>
              {rawLocalStorageEnabled
                ? "붙여넣은 원문 텍스트 전체를 PC 내 대용량 저장소(IndexedDB)에 보관합니다."
                : "원문 텍스트 전체 저장이 비활성화되어 있습니다."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
