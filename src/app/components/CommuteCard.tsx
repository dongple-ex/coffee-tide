"use client";

import React, { useEffect, useState } from "react";
import { CommuteInfo } from "@/lib/types/commute";
import { KakaoMapIcon, NaverMapIcon } from "./brandIcons";
import styles from "./commuteCard.module.css";

interface CommuteCardProps {
  homeStation: string;
  workStation: string;
}

export function CommuteCard({ homeStation, workStation }: CommuteCardProps) {
  const [commute, setCommute] = useState<CommuteInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetch(`/api/commute?home=${encodeURIComponent(homeStation)}&work=${encodeURIComponent(workStation)}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && data.commute) {
          setCommute(data.commute);
        }
      })
      .catch((err) => {
        console.warn("[coffeeTide] Commute fetch error:", err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [homeStation, workStation]);

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

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.titleGroup}>
          <span>🚇 스마트 길찾기</span>
          <span className={`${styles.modeBadge} ${isMorning ? styles.morningBadge : styles.eveningBadge}`}>
            {isMorning ? "🌅 출근길 모드" : "🌆 퇴근길 모드"}
          </span>
        </div>
      </div>

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

      <div className={styles.infoRow}>
        {commute.statusText}
        <br />
        <b>권장 노선:</b> {commute.lineInfo} (예상 소요 약 {commute.durationMinutes}분)
      </div>

      <div className={styles.btnGroup}>
        <button
          className={styles.mapBtn}
          style={{ cursor: "pointer" }}
          onClick={() =>
            openAppOrWeb(
              `kakaomap://route?ep=${encodeURIComponent(commute.destination)}`,
              commute.kakaoMapUrl
            )
          }
        >
          <KakaoMapIcon size={18} /> 카카오맵 앱 실행
        </button>
        <button
          className={styles.mapBtn}
          style={{ cursor: "pointer" }}
          onClick={() =>
            openAppOrWeb(
              `nmap://route/public?dname=${encodeURIComponent(commute.destination)}&appname=coffeetide`,
              commute.naverMapUrl
            )
          }
        >
          <NaverMapIcon size={18} /> 네이버지도 앱 실행
        </button>
      </div>
    </div>
  );
}
