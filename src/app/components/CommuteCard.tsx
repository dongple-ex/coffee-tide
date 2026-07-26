"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CommuteInfo } from "@/lib/types/commute";
import { buildMapLinks, LatLng } from "@/lib/mapLinks";
import { KakaoMapIcon, NaverMapIcon } from "./brandIcons";
import styles from "./commuteCard.module.css";

interface CommuteCardProps {
  homeStation: string;
  workStation: string;
  transportType?: "public" | "car";
  /** 지도 앱 딥링크용 좌표 — 없으면 웹 지도로만 연결된다 */
  homeCoords?: LatLng;
  workCoords?: LatLng;
  /** 좌표 등록 안내에서 설정 모달을 열기 위한 콜백 */
  onOpenSettings?: () => void;
}

const REFRESH_QUOTES = [
  "이동 정보를 다시 불러왔어요 ☕",
  "출발·도착지 기준 길찾기 정보를 새로고침했습니다!",
  "지금 시간대 기준으로 이동 방향을 다시 계산했어요 ☕",
];

export function CommuteCard({
  homeStation,
  workStation,
  transportType = "public",
  homeCoords,
  workCoords,
  onOpenSettings,
}: CommuteCardProps) {
  const [commute, setCommute] = useState<CommuteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noticeText, setNoticeText] = useState("");

  // 순수 fetch — 상태 갱신은 호출부(비동기 콜백)에서만 한다
  const loadCommute = useCallback(async (): Promise<CommuteInfo | null> => {
    try {
      const res = await fetch(
        `/api/commute?home=${encodeURIComponent(homeStation)}&work=${encodeURIComponent(
          workStation
        )}&type=${transportType}&t=${Date.now()}`
      );
      const data = (await res.json()) as { success?: boolean; commute?: CommuteInfo };
      return data.success && data.commute ? data.commute : null;
    } catch (err) {
      console.warn("[coffeeTide] Commute fetch error:", err);
      return null;
    }
  }, [homeStation, workStation, transportType]);

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
      setNoticeText(
        info
          ? REFRESH_QUOTES[Math.floor(Math.random() * REFRESH_QUOTES.length)]
          : "길찾기 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
      );
      setTimeout(() => setNoticeText(""), 4000);
      setRefreshing(false);
    });
  };

  // 앱이 열리면 페이지가 백그라운드로 내려간다(visibilitychange/pagehide).
  // 예전 구현은 `Date.now() - start < 1500`을 썼는데 800ms 타이머 안에서는 항상 참이라
  // 앱이 정상적으로 열려도 웹 탭이 매번 같이 열렸다.
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
      // 앱 전환이 감지되지 않았을 때만 웹으로 폴백 (모바일에서 window.open은 차단되기 쉬워 location 이동)
      if (!appOpened && !document.hidden) window.location.href = webUrl;
    }, 1200);
  };

  // 지도 링크는 좌표가 필요해 클라이언트에서 만든다(좌표를 서버로 보내지 않기 위함).
  // 출근이면 집→회사, 퇴근이면 회사→집이므로 좌표도 같은 방향으로 짝지운다.
  const isMorningMode = (commute?.mode ?? "morning") === "morning";
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

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.titleGroup}>🚇 출퇴근 스마트 길찾기</div>
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
          <div className={styles.titleGroup}>🚇 출퇴근 스마트 길찾기</div>
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
          <span>{isCar ? "🚗 자차 길찾기" : "🚇 대중교통 길찾기"}</span>
          <span className={`${styles.modeBadge} ${isMorning ? styles.morningBadge : styles.eveningBadge}`}>
            {isMorning ? "🌅 출근길 모드" : "🌆 퇴근길 모드"}
          </span>
          {/* K2: 공공데이터포털(TAGO·도로공사) 실연동 전까지 예시 값임을 명시한다 */}
          <span className={styles.modeBadge} title="실시간 교통 API 연동 전 예시 값입니다">
            🧪 예시 데이터
          </span>
        </div>
        <button
          className={styles.iconBtn}
          disabled={refreshing}
          onClick={handleManualRefresh}
          title="길찾기 정보 다시 불러오기"
          aria-label="길찾기 정보 새로고침"
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

      {/* K2: 실연동(TAGO·한국도로공사) 전까지 수치가 예시임을 사용자에게 분명히 알린다 */}
      <div
        style={{
          fontSize: "0.74rem",
          color: "var(--muted)",
          background: "rgba(255,180,84,0.08)",
          border: "1px solid rgba(255,180,84,0.25)",
          padding: "6px 10px",
          borderRadius: "8px",
          marginBottom: "10px",
          lineHeight: 1.45,
        }}
      >
        ⚠️ 출발·도착 시각과 소요시간·요금·혼잡도는 <b>실시간 연동 전 예시 값</b>입니다. 정확한 정보는
        아래 지도 앱에서 확인해 주세요.
      </div>

      {/* 출발 및 도착 메인 카드 */}
      <div className={styles.routeContainer}>
        <div className={styles.stationBlock}>
          <span className={styles.stationLabel}>출발 ({commute.nextDepartureTime} 출발)</span>
          <span className={styles.stationName}>{commute.origin}</span>
        </div>
        <div className={styles.arrowIcon}>➔</div>
        <div className={styles.stationBlock} style={{ textAlign: "right" }}>
          <span className={styles.stationLabel}>예상 도착 ({commute.expectedArrivalTime})</span>
          <span className={styles.stationName}>{commute.destination}</span>
        </div>
      </div>

      {/* 수단별(지하철, 기차, 버스 / 자차 도로) 실시간 경로 카드 그리드 */}
      {commute.routeOptions && commute.routeOptions.length > 0 && (
        <div className={styles.modeRouteGrid}>
          {commute.routeOptions.map((opt, i) => (
            <div key={i} className={styles.modeRouteCard}>
              <div className={styles.modeRouteHeader}>
                <div className={styles.modeRouteTitle}>
                  <span>{opt.icon}</span>
                  <span>{opt.name}</span>
                </div>
                <span className={styles.modeRouteBadge}>{opt.badgeText}</span>
              </div>
              <div className={styles.modeRouteDuration}>약 {opt.duration}분</div>
              <div className={styles.modeRouteDetails}>
                <div className={styles.modeRouteDetailsRow}>
                  <span>🕒 출발</span>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>{opt.departureTime}</span>
                </div>
                <div className={styles.modeRouteDetailsRow}>
                  <span>💳 요금</span>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>{opt.fare}</span>
                </div>
                <div className={styles.modeRouteDetailsRow}>
                  <span>🚦 상태</span>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>{opt.congestion}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI 바리스타 실시간 이동 꿀팁 */}
      {commute.smartTip && (
        <div className={styles.smartTipBox}>
          {commute.smartTip.replace(/\*\*/g, "")}
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

      {/* 좌표가 없으면 두 앱 모두 딥링크가 불가능하다 — 왜 앱이 바로 안 열리는지, 어떻게 켜는지 알린다 */}
      {!mapLinks.hasCoords && (
        <p
          style={{
            fontSize: "0.72rem",
            color: "var(--muted)",
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          📍 설정에서 집·회사 위치를 지정하면 지도 <b>앱</b>이 출발지·도착지까지 채운 채로 바로 열립니다.
          {onOpenSettings && (
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
        </p>
      )}
    </div>
  );
}
