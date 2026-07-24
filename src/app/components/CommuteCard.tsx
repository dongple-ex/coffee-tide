"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CommuteInfo } from "@/lib/types/commute";
import { KakaoMapIcon, NaverMapIcon } from "./brandIcons";
import styles from "./commuteCard.module.css";

interface CommuteCardProps {
  homeStation: string;
  workStation: string;
  transportType?: "public" | "car";
}

const REFRESH_QUOTES = [
  "최신 열차 시각과 실시간 도로 교통 상황을 갓 추출해 갱신했어요 ☕",
  "실시간 배차 간격 및 정체 구간 정보를 따스하게 새로고침했습니다!",
  "지금 시간대 최적의 이동 경로와 환승 꿀팁을 갱신했어요 ☕",
  "도로 및 철도 구간의 실시간 혼잡도 현황을 갱신 완료했습니다!",
];

export function CommuteCard({ homeStation, workStation, transportType = "public" }: CommuteCardProps) {
  const [commute, setCommute] = useState<CommuteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noticeText, setNoticeText] = useState("");

  const fetchCommuteData = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const res = await fetch(
          `/api/commute?home=${encodeURIComponent(homeStation)}&work=${encodeURIComponent(
            workStation
          )}&type=${transportType}&t=${Date.now()}`
        );
        const data = await res.json();
        if (data.success && data.commute) {
          setCommute(data.commute);
          if (isManualRefresh) {
            const randomQuote = REFRESH_QUOTES[Math.floor(Math.random() * REFRESH_QUOTES.length)];
            setNoticeText(randomQuote);
            setTimeout(() => setNoticeText(""), 4000);
          }
        }
      } catch (err) {
        console.warn("[coffeeTide] Commute fetch error:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [homeStation, workStation, transportType]
  );

  useEffect(() => {
    void fetchCommuteData(false);
  }, [fetchCommuteData]);

  const openAppOrWeb = (appScheme: string, webUrl: string) => {
    if (typeof window === "undefined") return;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      const start = Date.now();
      window.location.href = appScheme;
      setTimeout(() => {
        if (Date.now() - start < 1500) {
          window.open(webUrl, "_blank");
        }
      }, 800);
    } else {
      window.open(webUrl, "_blank");
    }
  };

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.titleGroup}>🚇 출퇴근 스마트 길찾기</div>
        </div>
        <div className={styles.infoRow}>실시간 길찾기 데이터를 확인하고 있습니다…</div>
      </div>
    );
  }

  if (!commute) return null;

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
        </div>
        <button
          className={styles.iconBtn}
          disabled={refreshing}
          onClick={() => void fetchCommuteData(true)}
          title="실시간 교통/열차 정보 다시 조회"
          aria-label="실시간 길찾기 새로고침"
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
          onClick={() => openAppOrWeb(commute.kakaoAppScheme, commute.kakaoMapUrl)}
        >
          <KakaoMapIcon size={18} /> 카카오맵 실행 ({commute.origin} ➔ {commute.destination})
        </button>
        <button
          className={styles.mapBtn}
          style={{ cursor: "pointer" }}
          onClick={() => openAppOrWeb(commute.naverAppScheme, commute.naverMapUrl)}
        >
          <NaverMapIcon size={18} /> 네이버지도 실행 ({commute.origin} ➔ {commute.destination})
        </button>
      </div>
    </div>
  );
}
