"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CommuteInfo, CommuteStop, CommuteTimetable } from "@/lib/types/commute";
import { buildMapLinks, LatLng } from "@/lib/mapLinks";
import { parseTimetableText, getNextDepartures, groupEntriesByHour } from "@/lib/commute/timetableParser";
import { loadLS, saveLS, LS_COMMUTE_TIMETABLES, DEFAULT_COMMUTE_TIMETABLES } from "@/lib/localStore";
import { KakaoMapIcon, NaverMapIcon } from "./brandIcons";
import { UiIcon } from "./UiIcon";
import styles from "./commuteCard.module.css";

interface CommuteCardProps {
  homeStation: string;
  workStation: string;
  transportType?: "public" | "car";
  /** 지도 앱 딥링크용 좌표 — 없으면 웹 지도로만 연결된다 */
  homeCoords?: LatLng;
  workCoords?: LatLng;
  /** 설정에서 찾아 둔 근접 정류소 — 실시간 도착정보 조회에 쓴다 */
  homeStop?: CommuteStop;
  workStop?: CommuteStop;
  onOpenSettings?: () => void;
}

/** 남은 초 → "3분 12초" / "곧 도착" */
function formatEta(seconds: number): string {
  if (seconds <= 30) return "곧 도착";
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min === 0) return `${sec}초 후`;
  return sec > 0 ? `${min}분 ${sec}초 후` : `${min}분 후`;
}

export function CommuteCard({
  homeStation,
  workStation,
  transportType = "public",
  homeCoords,
  workCoords,
  homeStop,
  workStop,
  onOpenSettings,
}: CommuteCardProps) {
  const [commute, setCommute] = useState<CommuteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noticeText, setNoticeText] = useState("");

  // 고정 시간표 목록 및 편집 상태
  const [timetables, setTimetables] = useState<CommuteTimetable[]>(() =>
    loadLS<CommuteTimetable[]>(LS_COMMUTE_TIMETABLES, DEFAULT_COMMUTE_TIMETABLES)
  );
  const [activeTimetableIndex, setActiveTimetableIndex] = useState(0);
  const [isTimetableExpanded, setIsTimetableExpanded] = useState(true);
  const [isEditingTimetable, setIsEditingTimetable] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [nowMinutes, setNowMinutes] = useState<number>(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  // 실시간 시각 동기화 (15초마다 갱신)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    };
    const interval = window.setInterval(updateTime, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const currentTimetable = timetables[activeTimetableIndex] || timetables[0];

  const nextDeparture = useMemo(() => {
    if (!currentTimetable?.entries?.length) return null;
    return getNextDepartures(currentTimetable.entries, nowMinutes);
  }, [currentTimetable, nowMinutes]);

  const groupedHours = useMemo(() => {
    if (!currentTimetable?.entries?.length) return [];
    return groupEntriesByHour(currentTimetable.entries);
  }, [currentTimetable]);

  const handleStartEdit = useCallback(() => {
    if (currentTimetable) {
      setEditTitle(currentTimetable.title);
      setEditText(currentTimetable.rawText || currentTimetable.entries.map((e) => `${e.time} ${e.destination ? `(${e.destination})` : ""}`).join(", "));
      setIsEditingTimetable(true);
    }
  }, [currentTimetable]);

  const handleSaveEdit = useCallback(() => {
    const parsedEntries = parseTimetableText(editText);
    if (!parsedEntries.length) {
      setNoticeText("시간표 형식을 확인해 주세요. (예: 18:08 (천안), 18:28 (신창))");
      setTimeout(() => setNoticeText(""), 4000);
      return;
    }

    const updated: CommuteTimetable = {
      ...currentTimetable,
      title: editTitle.trim() || currentTimetable.title,
      rawText: editText,
      entries: parsedEntries,
    };

    const nextTimetables = [...timetables];
    nextTimetables[activeTimetableIndex] = updated;
    setTimetables(nextTimetables);
    saveLS(LS_COMMUTE_TIMETABLES, nextTimetables);
    setIsEditingTimetable(false);
    setNoticeText("고정 시간표가 저장되었습니다.");
    setTimeout(() => setNoticeText(""), 3000);
  }, [editText, editTitle, currentTimetable, timetables, activeTimetableIndex]);

  const handleResetPreset = useCallback(() => {
    setTimetables(DEFAULT_COMMUTE_TIMETABLES);
    saveLS(LS_COMMUTE_TIMETABLES, DEFAULT_COMMUTE_TIMETABLES);
    setActiveTimetableIndex(0);
    setIsEditingTimetable(false);
    setNoticeText("기본 급행 시간표로 초기화되었습니다.");
    setTimeout(() => setNoticeText(""), 3000);
  }, []);

  // 출근이면 집에서, 퇴근이면 회사에서 출발한다 — 정류소도 같은 방향으로 고른다.
  // 서버 응답의 mode를 기다리지 않고 클라이언트 시간으로 먼저 정해야 요청 파라미터를 만들 수 있다.
  const isMorningNow = useMemo(() => {
    const h = new Date().getHours();
    return h >= 5 && h < 12;
  }, []);
  const originStop = isMorningNow ? homeStop : workStop;

  // 순수 fetch — 상태 갱신은 호출부(비동기 콜백)에서만 한다
  const loadCommute = useCallback(async (): Promise<CommuteInfo | null> => {
    try {
      const params = new URLSearchParams({
        home: homeStation,
        work: workStation,
        type: transportType,
        t: String(Date.now()),
      });
      if (originStop) {
        params.set("nodeId", originStop.nodeId);
        params.set("cityCode", originStop.cityCode);
        params.set("stopName", originStop.name);
      }
      const res = await fetch(`/api/commute?${params.toString()}`);
      const data = (await res.json()) as { success?: boolean; commute?: CommuteInfo };
      return data.success && data.commute ? data.commute : null;
    } catch (err) {
      console.warn("[coffeeTide] Commute fetch error:", err);
      return null;
    }
  }, [homeStation, workStation, transportType, originStop]);

  useEffect(() => {
    let cancelled = false;
    void loadCommute().then((info) => {
      if (cancelled) return;
      if (info) setCommute(info);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadCommute]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    void loadCommute().then((info) => {
      if (info) setCommute(info);
      // 실패를 조용히 삼키면 "새로고침했다"는 인상만 남는다 — 결과를 그대로 알린다
      setNoticeText(info ? "도착정보를 다시 불러왔어요." : "정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      setTimeout(() => setNoticeText(""), 4000);
      setRefreshing(false);
    });
  };

  const isMorningMode = (commute?.mode ?? (isMorningNow ? "morning" : "evening")) === "morning";
  const mapLinks = useMemo(
    () =>
      buildMapLinks({
        origin: commute?.origin ?? homeStation,
        destination: commute?.destination ?? workStation,
        originCoords: isMorningMode ? homeCoords : workCoords,
        destCoords: isMorningMode ? workCoords : homeCoords,
        isCar: (commute?.transportType ?? transportType) === "car",
      }),
    [commute, homeStation, workStation, homeCoords, workCoords, transportType, isMorningMode]
  );

  // 앱이 열리면 페이지가 백그라운드로 내려간다(visibilitychange/pagehide).
  const openAppOrWeb = (appScheme: string | null, webUrl: string) => {
    if (typeof window === "undefined") return;

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isMobile || !appScheme) {
      window.open(webUrl, "_blank", "noopener,noreferrer");
      return;
    }

    let appOpened = false;
    const markOpened = () => {
      appOpened = true;
    };
    document.addEventListener("visibilitychange", markOpened, { once: true });
    window.addEventListener("pagehide", markOpened, { once: true });

    window.location.href = appScheme;

    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", markOpened);
      window.removeEventListener("pagehide", markOpened);
      if (!appOpened && !document.hidden) window.location.href = webUrl;
    }, 1200);
  };

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.titleGroup}><UiIcon name="route" size={18} />출퇴근 스마트 길찾기</div>
        </div>
        <div className={styles.infoRow}>길찾기 정보를 불러오고 있습니다…</div>
      </div>
    );
  }

  // 조회 실패 시 카드가 통째로 사라지면 사용자는 이유를 알 수 없다 — 상태를 남긴다
  if (!commute) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.titleGroup}><UiIcon name="route" size={18} />출퇴근 스마트 길찾기</div>
          <button
            className={styles.iconBtn}
            disabled={refreshing}
            onClick={handleManualRefresh}
            title="다시 시도"
            aria-label="길찾기 정보 다시 시도"
          >
            ↻
          </button>
        </div>
        <div className={styles.infoRow}>
          길찾기 정보를 불러오지 못했어요. 새로고침을 눌러 다시 시도해 주세요.
        </div>
      </div>
    );
  }

  const isMorning = commute.mode === "morning";
  const isCar = commute.transportType === "car";

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.titleGroup}>
          <span className={styles.titleGroup}><UiIcon name="route" size={18} />{isCar ? "자차 길찾기" : "대중교통 길찾기"}</span>
          <span className={`${styles.modeBadge} ${isMorning ? styles.morningBadge : styles.eveningBadge}`}>
            {isMorning ? "출근길" : "퇴근길"}
          </span>
        </div>
        <button
          className={styles.iconBtn}
          disabled={refreshing}
          onClick={handleManualRefresh}
          title="도착정보 다시 불러오기"
          aria-label="도착정보 새로고침"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transition: "transform 0.5s ease",
              transform: refreshing ? "rotate(360deg)" : "none",
            }}
          >
            <path d="M21.5 2v6h-6" />
            <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </button>
      </div>

      {noticeText && (
        <div
          style={{
            fontSize: "0.78rem",
            color: "var(--accent)",
            background: "var(--accent-dim)",
            padding: "6px 10px",
            borderRadius: "8px",
            marginBottom: "10px",
            fontWeight: 500,
          }}
        >
          {noticeText}
        </div>
      )}

      {/* 출발 → 도착 */}
      <div className={styles.routeContainer}>
        <div className={styles.stationBlock}>
          <span className={styles.stationLabel}>출발</span>
          <span className={styles.stationName}>{commute.origin}</span>
        </div>
        <div className={styles.arrowIcon}>➔</div>
        <div className={styles.stationBlock} style={{ textAlign: "right" }}>
          <span className={styles.stationLabel}>도착</span>
          <span className={styles.stationName}>{commute.destination}</span>
        </div>
      </div>

      {/* 고정 시간표 & 급행 알리미 섹션 */}
      {currentTimetable && (
        <div className={styles.timetableSection}>
          <div className={styles.timetableHeader}>
            <div className={styles.timetableTitleRow}>
              <UiIcon name="timer" size={16} />
              <span>{currentTimetable.title}</span>
            </div>
            <div className={styles.timetableActions}>
              <button
                type="button"
                className={styles.miniBtn}
                onClick={handleStartEdit}
                title="시간표 직접 수정"
              >
                ✏️ 수정
              </button>
              <button
                type="button"
                className={styles.miniBtn}
                onClick={() => setIsTimetableExpanded((prev) => !prev)}
                title={isTimetableExpanded ? "시간표 접기" : "시간표 펼치기"}
              >
                {isTimetableExpanded ? "▲ 접기" : "▼ 시간표 보기"}
              </button>
            </div>
          </div>

          {/* 다음 열차 카운트다운 배너 */}
          {nextDeparture?.next && (
            <div className={styles.nextDepartureBanner}>
              <div className={styles.nextDepartureLeft}>
                <div className={styles.nextDepartureLabel}>
                  <span>⚡ 다음 급행</span>
                  {nextDeparture.isTomorrowNext && <span>(내일 첫차)</span>}
                </div>
                <div className={styles.nextDepartureTime}>
                  {nextDeparture.next.time}
                  {nextDeparture.next.destination && (
                    <span className={styles.nextDepartureDest}>
                      ({nextDeparture.next.destination}행)
                    </span>
                  )}
                </div>
                {nextDeparture.subsequent && (
                  <div className={styles.subsequentText}>
                    ▷ 다다음: {nextDeparture.subsequent.time}
                    {nextDeparture.subsequent.destination ? ` (${nextDeparture.subsequent.destination}행)` : ""}
                    {" · "}
                    {nextDeparture.subsequentDiffMin}분 후
                  </div>
                )}
              </div>
              <div className={styles.nextDepartureBadge}>
                {nextDeparture.nextDiffMin <= 0
                  ? "지금 출발!"
                  : nextDeparture.nextDiffMin <= 3
                  ? "곧 도착!"
                  : `${nextDeparture.nextDiffMin}분 남음`}
              </div>
            </div>
          )}

          {/* 시간표 인라인 편집기 */}
          {isEditingTimetable ? (
            <div className={styles.editorContainer}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                시간표 제목
              </div>
              <input
                type="text"
                className={styles.editorInput}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="시간표 이름"
              />
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                시간표 내용 (예: 18:08 (천안), 18:28 (신창) 또는 18시 | 18:08 (천안)...)
              </div>
              <textarea
                className={styles.editorTextarea}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="18시 | 18:08 (천안), 18:28 (신창), 18:52 (신창)..."
                rows={5}
              />
              <div className={styles.editorBtnRow}>
                <button
                  type="button"
                  className={styles.miniBtn}
                  onClick={handleResetPreset}
                  style={{ marginRight: "auto" }}
                >
                  기본값 복원
                </button>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setIsEditingTimetable(false)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={handleSaveEdit}
                >
                  저장
                </button>
              </div>
            </div>
          ) : isTimetableExpanded ? (
            /* 스크린샷 포맷 시간대별 테이블 뷰 */
            <div className={styles.timetableTableWrapper}>
              <table className={styles.timetableTable}>
                <thead>
                  <tr>
                    <th style={{ width: "60px" }}>시간대</th>
                    <th>출발 시각 (행선지)</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedHours.map((group) => {
                    const currentHour = Math.floor(nowMinutes / 60);
                    const isCurrentHour = group.hour === currentHour;
                    return (
                      <tr key={group.hour}>
                        <td className={isCurrentHour ? styles.hourActive : styles.hourCol}>
                          {group.label}
                        </td>
                        <td>
                          <div className={styles.entriesRow}>
                            {group.items.map((item, idx) => {
                              const isNext = nextDeparture?.next?.time === item.time;
                              const isPassed = item.minutes < nowMinutes;
                              return (
                                <span
                                  key={idx}
                                  className={`${styles.entryChip} ${
                                    isNext ? styles.entryChipNext : isPassed ? styles.entryChipPassed : ""
                                  }`}
                                  title={`${item.time} ${item.destination ? `(${item.destination}행)` : ""}`}
                                >
                                  <strong>{item.time}</strong>
                                  {item.destination && (
                                    <span className={styles.entryDest}>
                                      ({item.destination})
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {/* 실시간 도착정보 — 국토교통부 TAGO */}
      {commute.arrivals.length > 0 && (
        <>
          {commute.stopName && (
            <div className={styles.infoRow} style={{ marginBottom: 6 }}>
              <b>{commute.stopName}</b> 실시간 도착
            </div>
          )}
          <div className={styles.modeRouteGrid}>
            {commute.arrivals.map((arr, i) => (
              <div key={`${arr.routeNo}-${i}`} className={styles.modeRouteCard}>
                <div className={styles.modeRouteHeader}>
                  <div className={styles.modeRouteTitle}>
                    <span>{arr.routeNo}번</span>
                  </div>
                  {arr.routeType && <span className={styles.modeRouteBadge}>{arr.routeType}</span>}
                </div>
                <div className={styles.modeRouteDuration}>{formatEta(arr.arrivalSeconds)}</div>
                {arr.stopsAway !== undefined && (
                  <div className={styles.modeRouteDetails}>
                    <div className={styles.modeRouteDetailsRow}>
                      <span>남은 정류장</span>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{arr.stopsAway}개</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* 수치를 못 채운 경우의 이유 — 추정치를 만들어 넣지 않는다 */}
      {commute.arrivals.length === 0 && commute.notice && (
        <div className={styles.infoRow} style={{ lineHeight: 1.5 }}>
          {commute.notice}
          {onOpenSettings && commute.notice.includes("설정") && (
            <>
              {" "}
              <button
                type="button"
                onClick={onOpenSettings}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  cursor: "pointer",
                  padding: 0,
                  font: "inherit",
                  textDecoration: "underline",
                }}
              >
                설정 열기
              </button>
            </>
          )}
        </div>
      )}

      <div className={styles.btnGroup}>
        <button
          className={styles.mapBtn}
          style={{ cursor: "pointer" }}
          onClick={() => openAppOrWeb(mapLinks.kakaoAppScheme, mapLinks.kakaoWebUrl)}
        >
          <KakaoMapIcon size={18} /> 카카오맵 길찾기 ({commute.origin} ➔ {commute.destination})
        </button>
        <button
          className={styles.mapBtn}
          style={{ cursor: "pointer" }}
          onClick={() => openAppOrWeb(mapLinks.naverAppScheme, mapLinks.naverWebUrl)}
        >
          <NaverMapIcon size={18} />{" "}
          {mapLinks.hasCoords
            ? `네이버지도 길찾기 (${commute.origin} ➔ ${commute.destination})`
            : `네이버지도에서 ${commute.destination} 찾기`}
        </button>
      </div>

      {!mapLinks.hasCoords && (
        <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
          설정에서 집·회사 위치를 지정하면 지도 <b>앱</b>이 출발지·도착지까지 채운 채로 열리고,
          가까운 정류소의 실시간 도착정보도 함께 보여드려요.
        </p>
      )}
    </div>
  );
}
