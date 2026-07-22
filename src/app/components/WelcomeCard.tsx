"use client";

import React, { useEffect, useState } from "react";
import styles from "./welcomeCard.module.css";

export interface WeatherData {
  temp: number;
  description: string;
  main: string;
  city: string;
}

interface WelcomeCardProps {
  compact?: boolean;
  weather?: WeatherData | null;
}

function getTimeState(): "morning" | "afternoon" | "evening" {
  const hours = new Date().getHours();
  if (hours >= 5 && hours < 12) return "morning";
  if (hours >= 12 && hours < 18) return "afternoon";
  return "evening";
}

function getDateLabel(): string {
  return new Date().toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export function WelcomeCard({ compact = false, weather }: WelcomeCardProps) {
  const [timeState] = useState<"morning" | "afternoon" | "evening">(getTimeState);
  const [dateLabel] = useState<string>(getDateLabel);

  const getTimeTheme = () => {
    switch (timeState) {
      case "morning":
        return {
          icon: "☕",
          period: "오전 집중 타임",
          bgClass: styles.morningTheme,
          subQuote: "커피 한 잔과 함께 오늘 오전을 차분하고 밀도 있게 시작해보세요.",
        };
      case "afternoon":
        return {
          icon: "☀️",
          period: "오후 소통 & 협업 타임",
          bgClass: styles.afternoonTheme,
          subQuote: "원활한 소통과 리듬감 있는 실행으로 오늘 목표를 향해 달려보세요.",
        };
      case "evening":
        return {
          icon: "🌙",
          period: "저녁 데일리 매듭",
          bgClass: styles.eveningTheme,
          subQuote: "오늘의 결실을 확인하고, 내일의 여유를 위해 편안히 매듭지어보세요.",
        };
    }
  };

  const theme = getTimeTheme();

  const renderGreetingMessage = () => {
    if (weather) {
      return `${weather.city}는 현재 ${weather.temp}°C, ${weather.description} 날씨입니다. ${theme.subQuote}`;
    }
    return `${dateLabel}, ${theme.subQuote}`;
  };

  return (
    <div className={`${styles.welcomeCard} ${theme.bgClass} ${compact ? styles.compactCard : ""}`}>
      <div className={styles.cardHeader}>
        <div className={styles.badgeGroup}>
          <span className={styles.timeBadge}>
            {theme.icon} {theme.period}
          </span>
          <span className={styles.dateText}>{dateLabel}</span>
        </div>
        {weather && (
          <div className={styles.weatherBadge}>
            <span>📍 {weather.city}</span>
            <span className={styles.weatherDot}>•</span>
            <span>{weather.temp}°C {weather.description}</span>
          </div>
        )}
      </div>

      <div className={styles.cardBody}>
        <h2 className={styles.greetingTitle}>
          안녕하세요! coffeeTide 비서가 준비한 브리핑입니다.
        </h2>
        <p className={styles.greetingSub}>{renderGreetingMessage()}</p>
      </div>
    </div>
  );
}
