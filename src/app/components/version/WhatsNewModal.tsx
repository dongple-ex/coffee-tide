"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  APP_VERSION,
  RELEASE_HISTORY,
  setLastSeenVersion,
  ReleaseItem,
} from "@/lib/appVersion";
import styles from "./WhatsNewModal.module.css";

interface Props {
  onClose: () => void;
  onAcknowledged?: () => void;
  compactMode?: boolean;
}

function ItemBadge({ type }: { type: ReleaseItem["type"] }) {
  switch (type) {
    case "feat":
      return <span className={styles.tagFeat}>신규</span>;
    case "enhance":
      return <span className={styles.tagEnhance}>개선</span>;
    case "fix":
      return <span className={styles.tagFix}>수정</span>;
    default:
      return null;
  }
}

export function WhatsNewModal({ onClose, onAcknowledged, compactMode = false }: Props) {
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  const latestRelease = RELEASE_HISTORY[0];
  const pastReleases = RELEASE_HISTORY.slice(1);

  const handleConfirm = () => {
    setLastSeenVersion(APP_VERSION);
    if (onAcknowledged) onAcknowledged();
    onClose();
  };

  if (typeof document === "undefined") return null;

  const modalContent = (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="coffeeTide 업데이트 소식"
    >
      <div
        className={`${styles.modal} ${compactMode ? styles.modalCompact : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`${styles.header} ${compactMode ? styles.headerCompact : ""}`}>
          <div className={`${styles.titleArea} ${compactMode ? styles.titleAreaCompact : ""}`}>
            <span className={styles.icon} aria-hidden="true">🎉</span>
            <h2 className={styles.title}>coffeeTide 업데이트 소식</h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={`${styles.body} ${compactMode ? styles.bodyCompact : ""}`}>
          {latestRelease && (
            <div className={styles.latestSection}>
              <div className={styles.versionHeader}>
                <span className={styles.versionBadge}>
                  {latestRelease.version} 최신
                </span>
                <span className={styles.versionDate}>{latestRelease.date}</span>
              </div>
              <h3 className={styles.releaseTitle}>{latestRelease.title}</h3>
              <p className={styles.releaseSummary}>{latestRelease.summary}</p>

              <div className={styles.itemsList}>
                {latestRelease.items.map((item, idx) => (
                  <div key={idx} className={styles.itemCard}>
                    <div className={styles.itemTop}>
                      <ItemBadge type={item.type} />
                      <span className={styles.itemTitle}>{item.title}</span>
                    </div>
                    <p className={styles.itemDesc}>{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pastReleases.length > 0 && (
            <>
              <button
                type="button"
                className={styles.historyToggle}
                onClick={() => setShowHistory(!showHistory)}
              >
                {showHistory ? "▲ 지난 업데이트 접기" : "▼ 지난 업데이트 내역 보기"}
              </button>

              {showHistory && (
                <div className={styles.historySection}>
                  {pastReleases.map((release) => (
                    <div key={release.version} className={styles.historyCard}>
                      <div className={styles.versionHeader}>
                        <span className={styles.historyVersion}>{release.version}</span>
                        <span className={styles.versionDate}>{release.date}</span>
                      </div>
                      <p className={styles.releaseSummary}>{release.summary}</p>
                      <div className={styles.itemsList}>
                        {release.items.map((item, idx) => (
                          <div key={idx} className={styles.itemCard}>
                            <div className={styles.itemTop}>
                              <ItemBadge type={item.type} />
                              <span className={styles.itemTitle}>{item.title}</span>
                            </div>
                            <p className={styles.itemDesc}>{item.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className={`${styles.footer} ${compactMode ? styles.footerCompact : ""}`}>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={handleConfirm}
          >
            확인 완료
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
