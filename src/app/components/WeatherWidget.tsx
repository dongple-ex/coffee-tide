"use client";

import React from "react";
import { WeatherData } from "./WelcomeCard";
import { UiIcon } from "./UiIcon";
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
    if (temp >= 28) return "무더운 날씨예요. 시원한 아이스 음료가 잘 어울립니다.";
    if (temp >= 20) return "바람이 선선해요. 깔끔한 드립 커피나 라떼가 잘 어울립니다.";
    if (temp >= 10) return "조금 쌀쌀해요. 따뜻한 라떼로 몸을 데워보세요.";
    return "추운 날씨예요. 따뜻한 에스프레소나 플랫 화이트를 추천합니다.";
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <UiIcon name="weather" size={18} />
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
          <span>위치 권한을 허용하면 현재 위치의 실시간 날씨를 확인할 수 있습니다.</span>
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
