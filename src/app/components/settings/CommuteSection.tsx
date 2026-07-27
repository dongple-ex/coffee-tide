"use client";

import React from "react";
import { CommuteConfig } from "@/lib/types/commute";
import styles from "../../page.module.css";

interface Props {
  config: CommuteConfig;
  /** 변경분을 상위에서 state 반영 + 영속화한다 */
  onChange: (next: CommuteConfig) => void;
  /** 지도 앱 딥링크에 필요한 좌표를 현재 위치로 지정 */
  onCaptureCoords: (which: "home" | "work") => void;
}

export function CommuteSection({ config, onChange, onCaptureCoords }: Props) {
  const bothCoordsSet = Boolean(config.homeCoords && config.workCoords);

  return (
    <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
      <div className={styles.cardTitle} style={{ display: "flex", alignItems: "center" }}>
        <span>🚇 출퇴근 길찾기 브리핑</span>
        <label className={styles.switchLabel}>
          <span>{config.enabled ? "ON" : "OFF"}</span>
          <input
            type="checkbox"
            className={styles.switchInput}
            checked={config.enabled}
            onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
          />
          <span className={styles.switchSlider} />
        </label>
      </div>

      <div className={styles.formRow} style={{ marginTop: 8 }}>
        <button
          type="button"
          className={`${styles.btn} ${config.transportType !== "car" ? styles.btnPrimary : ""}`}
          onClick={() => onChange({ ...config, transportType: "public" })}
          style={{ flex: 1 }}
        >
          🚌 / 🚇 대중교통
        </button>
        <button
          type="button"
          className={`${styles.btn} ${config.transportType === "car" ? styles.btnPrimary : ""}`}
          onClick={() => onChange({ ...config, transportType: "car" })}
          style={{ flex: 1 }}
        >
          🚗 자동차 (자차)
        </button>
      </div>

      <div className={styles.formRow} style={{ marginTop: 8 }}>
        <input
          className={styles.input}
          placeholder="집/출발역 (예: 서울역)"
          value={config.homeStation}
          onChange={(e) => onChange({ ...config, homeStation: e.target.value })}
          aria-label="집/출발역"
        />
        <input
          className={styles.input}
          placeholder="회사/도착역 (예: 수원역)"
          value={config.workStation}
          onChange={(e) => onChange({ ...config, workStation: e.target.value })}
          aria-label="회사/도착역"
        />
      </div>

      {/* 카카오맵·네이버지도 앱 딥링크는 둘 다 좌표가 필수 — 그 자리에서 현재 위치로 지정한다 */}
      <div className={styles.formRow} style={{ marginTop: 8 }}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => onCaptureCoords("home")}
          style={{ flex: 1 }}
        >
          {config.homeCoords ? "📍 집 위치 재지정" : "📍 현재 위치를 집으로"}
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={() => onCaptureCoords("work")}
          style={{ flex: 1 }}
        >
          {config.workCoords ? "📍 회사 위치 재지정" : "📍 현재 위치를 회사로"}
        </button>
      </div>

      {(config.homeStop || config.workStop) && (
        <div className={styles.connNote} style={{ marginTop: 6, lineHeight: 1.6 }}>
          🚏 등록된 정류소 —{" "}
          {config.homeStop ? (
            <>
              집: <b>{config.homeStop.name}</b>
              {config.homeStop.distanceM !== undefined && ` (약 ${config.homeStop.distanceM}m)`}
            </>
          ) : (
            "집: 미등록"
          )}
          {" · "}
          {config.workStop ? (
            <>
              회사: <b>{config.workStop.name}</b>
              {config.workStop.distanceM !== undefined && ` (약 ${config.workStop.distanceM}m)`}
            </>
          ) : (
            "회사: 미등록"
          )}
        </div>
      )}

      <p className={styles.connNote}>
        시간대에 따라 오전(출근 모드), 오후(퇴근 모드)로 자동 전환하여 대시보드 스마트 카드로
        보여드립니다.
        <br />
        집·회사에서 각각 <b>위치 지정</b>을 눌러두면 ① 카카오맵·네이버지도 <b>앱</b>이 출발지·도착지까지
        채운 채로 열리고 ② 가까운 정류소의 <b>실시간 버스 도착정보</b>(국토교통부 TAGO)를 보여드립니다
        {bothCoordsSet ? " (지정 완료 ✅)" : " (미지정 시 웹 지도 연결만)"}.
        <br />
        좌표는 이 브라우저에만 저장되며, 정류소를 찾을 때 <b>한 번만</b> 서버를 거칩니다. 이후에는
        정류소 코드만 오갑니다.
      </p>
    </section>
  );
}
