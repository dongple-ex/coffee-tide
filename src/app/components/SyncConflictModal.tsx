"use client";

import React from "react";
import type { SyncConflict } from "@/lib/sync/contracts";
import styles from "./SyncConflictModal.module.css";

interface SyncConflictModalProps {
  conflict: SyncConflict | null;
  onResolve: (choice: "keep_local" | "keep_server" | "keep_both", conflict: SyncConflict) => void;
  onClose: () => void;
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  conflict,
  onResolve,
  onClose,
}) => {
  if (!conflict) return null;

  const { localItem, serverItem } = conflict;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
    >
      <div className={styles.modal}>
        <button
          type="button"
          onClick={onClose}
          className={styles.closeButton}
          aria-label="닫기"
        >
          ✕
        </button>
        <div className={styles.header}>
          <div className={styles.alertIcon}>
            !
          </div>
          <div>
            <h2 id="conflict-title" className={styles.title}>
              동기화 충돌 발생
            </h2>
            <p className={styles.description}>
              이 기기와 클라우드에서 동시에 수정되어 충돌이 발생했습니다. 보관할 버전을 선택해 주세요.
            </p>
          </div>
        </div>

        {/* 비교 카드 */}
        <div className={styles.comparisonGrid}>
          {/* 이 기기 버전 */}
          <div className={styles.versionCard}>
            <div className={styles.versionHeader}>
              <span className={`${styles.versionBadge} ${styles.localBadge}`}>
                이 기기 (로컬 v{localItem.version})
              </span>
              <span className={styles.time}>
                {localItem.updatedAt ? new Date(localItem.updatedAt).toLocaleTimeString() : ""}
              </span>
            </div>
            <h3 className={styles.itemTitle}>{localItem.title}</h3>
            <p className={styles.itemContent}>
              {localItem.content || "(내용 없음)"}
            </p>
            {localItem.workNote && (
              <div className={styles.note}>
                메모: {localItem.workNote}
              </div>
            )}
          </div>

          {/* 클라우드 버전 */}
          <div className={styles.versionCard}>
            <div className={styles.versionHeader}>
              <span className={`${styles.versionBadge} ${styles.serverBadge}`}>
                클라우드 (서버 v{serverItem.version})
              </span>
              <span className={styles.time}>
                {serverItem.updatedAt ? new Date(serverItem.updatedAt).toLocaleTimeString() : ""}
              </span>
            </div>
            <h3 className={styles.itemTitle}>{serverItem.title}</h3>
            <p className={styles.itemContent}>
              {serverItem.content || "(내용 없음)"}
            </p>
            {serverItem.workNote && (
              <div className={styles.note}>
                메모: {serverItem.workNote}
              </div>
            )}
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => onResolve("keep_local", conflict)}
            className={`${styles.actionButton} ${styles.localAction}`}
          >
            이 기기 버전 유지
          </button>
          <button
            type="button"
            onClick={() => onResolve("keep_server", conflict)}
            className={`${styles.actionButton} ${styles.serverAction}`}
          >
            클라우드 버전 유지
          </button>
          <button
            type="button"
            onClick={() => onResolve("keep_both", conflict)}
            className={styles.actionButton}
          >
            둘 다 보관 (사본 생성)
          </button>
        </div>
      </div>
    </div>
  );
};
