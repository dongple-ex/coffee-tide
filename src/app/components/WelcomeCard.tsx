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
  collapsed?: boolean;
  onToggleCollapsed?: (collapsed: boolean) => void;
  refreshKey?: number;
  taskCount?: number;
  urgentCount?: number;
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

export function WelcomeCard({
  compact = false,
  weather,
  collapsed,
  onToggleCollapsed,
  refreshKey = 0,
  taskCount = 0,
  urgentCount = 0,
}: WelcomeCardProps) {
  const [timeState, setTimeState] = useState<"morning" | "afternoon" | "evening">(getTimeState);
  const [dateLabel, setDateLabel] = useState<string>(getDateLabel);
  const [internalCollapsed, setInternalCollapsed] = useState(false);

  const isCollapsed = collapsed !== undefined ? collapsed : internalCollapsed;

  const handleSetCollapsed = (nextVal: boolean) => {
    setInternalCollapsed(nextVal);
    onToggleCollapsed?.(nextVal);
  };

  // refreshKey 변경 시 날짜와 시간대 실시간 갱신
  useEffect(() => {
    setTimeState(getTimeState());
    setDateLabel(getDateLabel());
  }, [refreshKey]);

  // 1분 주기로 날짜 및 시간대 변경 자동 감지
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeState(getTimeState());
      setDateLabel(getDateLabel());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // 30초 후 자동으로 한 줄로 접히는 웰컴 효과
    const timer = setTimeout(() => {
      handleSetCollapsed(true);
    }, 30000);

    return () => clearTimeout(timer);
  }, []);

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

  const getProactiveMessage = () => {
    const hours = new Date().getHours();
    if (hours >= 17) {
      return {
        title: "🌆 오늘 하루도 정말 수고 많으셨습니다!",
        subText: "퇴근 전 Handoff(핸드오프) 상태를 남겨두시면 내일 아침 출근이 훨씬 편안해집니다 ☕",
      };
    }
    if (urgentCount >= 2) {
      return {
        title: `🚨 긴급 조치가 필요한 업무 ${urgentCount}건이 있습니다`,
        subText: "마감이나 생애주기가 임박한 주요 업무부터 먼저 확인해 보세요.",
      };
    }
    if (taskCount >= 5) {
      return {
        title: `📋 오늘 처리할 할 일이 총 ${taskCount}개 준비되어 있습니다`,
        subText: "에스프레소 한 잔과 함께 차근차근 정리하며 리듬감 있게 시작해 보세요.",
      };
    }
    return {
      title: "☕ 안녕하세요! AI 바리스타가 준비한 브리핑입니다.",
      subText: weather
        ? `${weather.city}는 현재 ${weather.temp}°C, ${weather.description} 날씨입니다. ${theme.subQuote}`
        : `${dateLabel}, ${theme.subQuote}`,
    };
  };

  const nudge = getProactiveMessage();

  return (
    <div
      className={`${styles.welcomeCard} ${theme.bgClass} ${compact ? styles.compactCard : ""} ${
        isCollapsed ? styles.collapsedCard : ""
      }`}
      onClick={() => isCollapsed && handleSetCollapsed(false)}
      style={{ cursor: isCollapsed ? "pointer" : "default" }}
      title={isCollapsed ? "클릭하여 브리핑 펼치기" : undefined}
    >
      <div className={styles.cardHeader}>
        <div className={styles.badgeGroup}>
          <span className={styles.timeBadge}>
            {theme.icon} {theme.period}
          </span>
          <span className={styles.dateText}>{dateLabel}</span>
        </div>
        <div className={styles.headerRightGroup}>
          {weather && (
            <div className={styles.weatherBadge}>
              <span>📍 {weather.city}</span>
              <span className={styles.weatherDot}>•</span>
              <span>{weather.temp}°C {weather.description}</span>
            </div>
          )}
          <button
            type="button"
            className={styles.toggleBtn}
            onClick={(e) => {
              e.stopPropagation();
              handleSetCollapsed(!isCollapsed);
            }}
            aria-label={isCollapsed ? "브리핑 펼치기" : "브리핑 접기"}
            title={isCollapsed ? "브리핑 펼치기" : "브리핑 접기"}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: isCollapsed ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.3s ease",
              }}
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>
      </div>

      <div className={styles.cardBody}>
        <h2 className={styles.greetingTitle}>{nudge.title}</h2>
        <p className={styles.greetingSub}>{nudge.subText}</p>
      </div>
    </div>
  );
}
