"use client";

import React from "react";
import { WeatherData } from "./WelcomeCard";
import styles from "./weatherWidget.module.css";

interface WeatherWidgetProps {
  weather: WeatherData | null;
  enabled: boolean;
  onEnableLocation?: () => void;
  onRefreshWeather?: () => void;
}

export function WeatherWidget({
  weather,
  enabled,
  onEnableLocation,
  onRefreshWeather,
}: WeatherWidgetProps) {
  const getCoffeeTip = (temp: number) => {
    if (temp >= 28) return "🥤 무더운 날씨! 시원하고 얼음 동동 띄운 아이스 아메리카노(아아)를 강추해요.";
    if (temp >= 20) return "☕ 바람이 선선한 날씨! 깔끔한 딥 드립 커피나 시원한 라떼가 딱이에요.";
    if (temp >= 10) return "☕ 살짝 쌀쌀한 날씨! 따뜻하고 부드러운 카페라떼나 바닐라 라떼를 추천해 드려요.";
    return "🔥 추운 날씨! 온몸을 녹여주는 에스프레소나 뜨거운 플랫 화이트를 즐겨보세요.";
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <span>🌤️</span>
          <span>실시간 기상 현황</span>
        </div>
        {enabled && (
          <button type="button" className={styles.refreshBtn} onClick={onRefreshWeather}>
            ↻ 갱신
          </button>
        )}
      </div>

      {!enabled || !weather ? (
        <div className={styles.disabledHint}>
          <span>📍 위치 권한을 허용하면 현재 위치의 실시간 날씨 브리핑을 받아볼 수 있습니다.</span>
          {onEnableLocation && (
            <button
              type="button"
              className={styles.refreshBtn}
              style={{ background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }}
              onClick={onEnableLocation}
            >
              위치 허용
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={styles.weatherBody}>
            <div className={styles.tempBox}>
              <span className={styles.tempVal}>{Math.round(weather.temp)}°C</span>
              <span className={styles.city}>{weather.city || "현재 위치"}</span>
            </div>
            <div className={styles.descBox}>
              <span className={styles.weatherDesc}>{weather.description}</span>
            </div>
          </div>

          <div className={styles.coffeeTip}>
            {getCoffeeTip(weather.temp)}
          </div>
        </>
      )}
    </div>
  );
}
