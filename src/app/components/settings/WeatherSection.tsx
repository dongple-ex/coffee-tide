"use client";

import React from "react";
import { WeatherData } from "../WelcomeCard";
import styles from "../../page.module.css";

interface Props {
  enabled: boolean;
  busy: boolean;
  weather: WeatherData | null;
  onEnable: () => void;
  onDisable: () => void;
}

export function WeatherSection({ enabled, busy, weather, onEnable, onDisable }: Props) {
  return (
    <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
      <div className={styles.cardTitle} style={{ display: "flex", alignItems: "center" }}>
        <span>📍 위치 &amp; 날씨 브리핑</span>
        {weather && enabled && (
          <small style={{ marginLeft: 6 }}>
            {weather.city} ({weather.temp}°C)
          </small>
        )}
        <label className={`${styles.switchLabel} ${busy ? styles.switchDisabled : ""}`}>
          <span>{enabled ? "ON" : "OFF"}</span>
          <input
            type="checkbox"
            className={styles.switchInput}
            checked={enabled}
            disabled={busy}
            onChange={(e) => (e.target.checked ? onEnable() : onDisable())}
          />
          <span className={styles.switchSlider} />
        </label>
      </div>
      <p className={styles.connNote}>
        위치 권한을 허용하면 계신 곳의 기상청 날씨와 맞춤 웰컴 메시지를 브리핑해 드립니다.
      </p>
    </section>
  );
}
