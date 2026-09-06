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
  briefTime,
  onChangeBriefTime,
  onToggle,
  onTestPush,
}: Props) {
  const enabled = Boolean(pushEndpoint);

  return (
    <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
      <div className={styles.cardTitle} style={{ display: "flex", alignItems: "center" }}>
        <span>브리핑 · AI 작업 완료 알림</span>
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
          아이폰은 iOS 16.4 이상에서 CoffeeTide를 홈 화면에 추가하고, 그 아이콘으로 열어 알림을 허용해 주세요. 현재 브라우저에서는 AI 완료 푸시를 사용할 수 없습니다.
        </p>
      ) : (
        <>
          <div className={styles.formRow} style={{ marginTop: 8 }}>
            <label
              className={styles.connNote}
              style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}
            >
              아침 브리핑 시각
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
                테스트 발송
              </button>
            )}
          </div>
          <p className={styles.connNote}>
            {pushEndpoint
              ? `매일 ${briefTime} 브리핑과 서버 AI 작업의 완료·실패 알림을 받습니다. 다른 앱을 사용하거나 화면을 잠가도 받을 수 있으며, 알림을 누르면 결과가 열립니다.`
              : "알림을 켜면 브리핑과 서버 AI 작업의 완료·실패 알림을 받을 수 있습니다. 브라우저 알림 권한만으로는 푸시 등록이 완료되지 않습니다."}
          </p>
          <p className={styles.connNote}>
            브라우저 내부의 로컬 AI 작업은 완료 푸시 대상에서 제외됩니다. 알림 도착 시점은 네트워크·집중 모드 설정에 따라 달라질 수 있습니다.
          </p>
        </>
      )}
    </section>
  );
}
