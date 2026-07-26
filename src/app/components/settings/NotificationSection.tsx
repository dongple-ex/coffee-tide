"use client";

import React from "react";
import styles from "../../page.module.css";

interface Props {
  /** null = 아직 판별 전, false = 미지원 브라우저 */
  pushSupported: boolean | null;
  pushEndpoint: string | null;
  pushBusy: boolean;
  notifPerm: NotificationPermission | "default";
  briefTime: string;
  onChangeBriefTime: (value: string) => void;
  onToggle: (enable: boolean) => void;
  onTestPush: () => void;
}

export function NotificationSection({
  pushSupported,
  pushEndpoint,
  pushBusy,
  notifPerm,
  briefTime,
  onChangeBriefTime,
  onToggle,
  onTestPush,
}: Props) {
  const enabled = notifPerm === "granted" || Boolean(pushEndpoint);

  return (
    <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
      <div className={styles.cardTitle} style={{ display: "flex", alignItems: "center" }}>
        <span>🔔 브리핑 &amp; 데스크톱 알림</span>
        <label className={`${styles.switchLabel} ${pushBusy ? styles.switchDisabled : ""}`}>
          <span>{enabled ? "ON" : "OFF"}</span>
          <input
            type="checkbox"
            className={styles.switchInput}
            checked={enabled}
            disabled={pushBusy}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className={styles.switchSlider} />
        </label>
      </div>
      {pushSupported === false ? (
        <p className={styles.connNote}>
          이 브라우저는 웹 푸시를 지원하지 않아요. (iOS는 홈 화면에 추가한 뒤 사용 가능)
        </p>
      ) : (
        <>
          <div className={styles.formRow} style={{ marginTop: 8 }}>
            <label
              className={styles.connNote}
              style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}
            >
              발송 시각
              <input
                type="time"
                className={styles.input}
                style={{ flex: 1 }}
                value={briefTime}
                onChange={(e) => onChangeBriefTime(e.target.value)}
                aria-label="아침 브리핑 발송 시각"
              />
            </label>
            {pushEndpoint && (
              <button
                className={styles.btn}
                disabled={pushBusy}
                onClick={onTestPush}
                style={{ padding: "4px 10px", fontSize: "0.78rem" }}
              >
                📨 테스트 발송
              </button>
            )}
          </div>
          <p className={styles.connNote}>
            매일 {briefTime}, 탭을 닫아두셔도 브리핑을 들고 찾아갈게요. (브라우저는 켜져 있어야 해요)
          </p>
        </>
      )}
    </section>
  );
}
