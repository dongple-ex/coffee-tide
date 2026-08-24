"use client";

import React, { useState } from "react";
import { parseTimetableText } from "@/lib/commute/timetableParser";
import { DEFAULT_COMMUTE_TIMETABLES } from "@/lib/localStore";
import { CommuteConfig, CommuteTimetable } from "@/lib/types/commute";
import styles from "../../page.module.css";

interface Props {
  config: CommuteConfig;
  /** 변경분을 상위에서 state 반영 + 영속화한다 */
  onChange: (next: CommuteConfig) => void;
  timetables: CommuteTimetable[];
  /** 고정 시간표 변경분을 상위에서 state 반영 + 영속화한다 */
  onChangeTimetables: (next: CommuteTimetable[]) => void;
  /** 지도 앱 딥링크에 필요한 좌표를 현재 위치로 지정 */
  onCaptureCoords: (which: "home" | "work") => void;
}

export function CommuteSection({
  config,
  onChange,
  timetables,
  onChangeTimetables,
  onCaptureCoords,
}: Props) {
  const bothCoordsSet = Boolean(config.homeCoords && config.workCoords);
  const currentTimetable = timetables[0] ?? DEFAULT_COMMUTE_TIMETABLES[0];
  const [timetableTitle, setTimetableTitle] = useState(currentTimetable?.title ?? "");
  const [timetableText, setTimetableText] = useState(currentTimetable?.rawText ?? "");
  const [timetableMessage, setTimetableMessage] = useState("");
  const [timetableInvalid, setTimetableInvalid] = useState(false);

  const saveTimetable = () => {
    const entries = parseTimetableText(timetableText);
    if (entries.length === 0) {
      setTimetableInvalid(true);
      setTimetableMessage("시간표 형식을 확인해 주세요.");
      return;
    }

    const updated: CommuteTimetable = {
      id: currentTimetable?.id ?? "tt_custom_commute",
      title: timetableTitle.trim() || "사용자 시간표",
      description: currentTimetable?.description,
      rawText: timetableText.trim(),
      entries,
      enabled: true,
    };
    const nextTimetables = timetables.length > 0 ? [updated, ...timetables.slice(1)] : [updated];
    onChangeTimetables(nextTimetables);
    setTimetableInvalid(false);
    setTimetableMessage("시간표가 저장되었습니다.");
  };

  const restoreDefaultTimetable = () => {
    const preset = DEFAULT_COMMUTE_TIMETABLES[0];
    if (!preset) return;
    setTimetableTitle(preset.title);
    setTimetableText(preset.rawText ?? "");
    onChangeTimetables(DEFAULT_COMMUTE_TIMETABLES);
    setTimetableInvalid(false);
    setTimetableMessage("기본 시간표로 복원되었습니다.");
  };

  return (
    <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
      <div className={styles.cardTitle} style={{ display: "flex", alignItems: "center" }}>
        <span>출퇴근 길찾기 브리핑</span>
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
          대중교통
        </button>
        <button
          type="button"
          className={`${styles.btn} ${config.transportType === "car" ? styles.btnPrimary : ""}`}
          onClick={() => onChange({ ...config, transportType: "car" })}
          style={{ flex: 1 }}
        >
          자동차 (자차)
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

      {config.transportType !== "car" && (
        <div
          role="group"
          aria-labelledby="commute-timetable-heading"
          style={{
            marginTop: 12,
            marginBottom: 12,
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 12,
            background: "var(--card-hover)",
          }}
        >
          <div
            id="commute-timetable-heading"
            style={{ fontSize: "0.86rem", fontWeight: 700, marginBottom: 10 }}
          >
            고정 시간표
          </div>

          <label htmlFor="commute-timetable-title" style={{ display: "block", marginBottom: 6 }}>
            <span style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: 4 }}>
              시간표 제목
            </span>
            <input
              id="commute-timetable-title"
              className={styles.input}
              value={timetableTitle}
              onChange={(event) => {
                setTimetableTitle(event.target.value);
                setTimetableMessage("");
              }}
              placeholder="예: 1호선 신도림역 하행 급행 (평일)"
            />
          </label>

          <label htmlFor="commute-timetable-content" style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: 4 }}>
              시간표 내용
            </span>
            <span
              id="commute-timetable-format"
              className={styles.connNote}
              style={{ display: "block", marginBottom: 6 }}
            >
              시간대 | 출발시각 (행선지), 출발시각 (행선지)
            </span>
            <textarea
              id="commute-timetable-content"
              className={styles.textarea}
              value={timetableText}
              onChange={(event) => {
                setTimetableText(event.target.value);
                setTimetableInvalid(false);
                setTimetableMessage("");
              }}
              placeholder={"18시 | 18:54 (신창)\n19시 | 19:26 (천안)"}
              rows={5}
              aria-describedby="commute-timetable-format commute-timetable-message"
              aria-invalid={timetableInvalid}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}
            />
          </label>

          <div className={styles.formRow} style={{ marginTop: 8, marginBottom: 0 }}>
            <button type="button" className={styles.btn} onClick={restoreDefaultTimetable}>
              기본값 복원
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={saveTimetable}
              style={{ marginLeft: "auto" }}
            >
              시간표 저장
            </button>
          </div>
          <div
            id="commute-timetable-message"
            role="status"
            aria-live="polite"
            style={{
              minHeight: 18,
              marginTop: 6,
              fontSize: "0.76rem",
              color: timetableInvalid ? "var(--danger)" : "var(--accent)",
            }}
          >
            {timetableMessage}
          </div>
        </div>
      )}

      {/* 카카오맵·네이버지도 앱 딥링크는 둘 다 좌표가 필수 — 그 자리에서 현재 위치로 지정한다 */}
      <div className={styles.formRow} style={{ marginTop: 8 }}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => onCaptureCoords("home")}
          style={{ flex: 1 }}
        >
          {config.homeCoords ? "집 위치 재지정" : "현재 위치를 집으로"}
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={() => onCaptureCoords("work")}
          style={{ flex: 1 }}
        >
          {config.workCoords ? "회사 위치 재지정" : "현재 위치를 회사로"}
        </button>
      </div>

      {(config.homeStop || config.workStop) && (
        <div className={styles.connNote} style={{ marginTop: 6, lineHeight: 1.6 }}>
          등록된 정류소 —{" "}
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
        {bothCoordsSet ? " (지정 완료)" : " (미지정 시 웹 지도 연결만)"}.
        <br />
        좌표는 이 브라우저에만 저장되며, 정류소를 찾을 때 <b>한 번만</b> 서버를 거칩니다. 이후에는
        정류소 코드만 오갑니다.
      </p>
    </section>
  );
}
