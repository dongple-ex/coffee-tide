"use client";

import React, { useEffect, useRef, useState } from "react";
import { BaristaBrewing } from "./barista/BaristaBrewing";
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
  taskCount?: number;
  urgentCount?: number;
  personaName?: string;
  presetId?: string;
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
  taskCount = 0,
  urgentCount = 0,
  personaName = "AI 바리스타",
  presetId = "karina",
}: WelcomeCardProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  // 1분마다 리렌더를 유발하는 시계 틱. 시간대·날짜 값 자체는 렌더 중에 파생한다
  // (effect에서 동기 setState로 갱신하면 cascading render — react-hooks/set-state-in-effect).
  const [, setClockTick] = useState(0);
  // 사용자가 직접 접거나 편 뒤에는 자동 접힘 타이머가 개입하지 않는다
  const userToggledRef = useRef(false);

  const isCollapsed = collapsed !== undefined ? collapsed : internalCollapsed;

  // 부모 리렌더(수동 새로고침 포함)나 시계 틱이 돌면 자연히 최신값으로 다시 계산된다
  const timeState = getTimeState();
  const dateLabel = getDateLabel();

  const handleSetCollapsed = (nextVal: boolean) => {
    userToggledRef.current = true;
    setInternalCollapsed(nextVal);
    onToggleCollapsed?.(nextVal);
  };

  // 1분 주기로 날짜 및 시간대 변경 자동 감지
  useEffect(() => {
    const interval = setInterval(() => setClockTick((tick) => tick + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // 30초 후 자동으로 한 줄로 접히는 웰컴 효과 — 사용자가 먼저 조작했다면 건너뛴다
    const timer = setTimeout(() => {
      if (userToggledRef.current) return;
      setInternalCollapsed(true);
      onToggleCollapsed?.(true);
    }, 30000);

    return () => clearTimeout(timer);
    // onToggleCollapsed는 호출부에서 안정된 참조(setState)를 넘긴다는 전제다.
    // 인라인 함수를 넘기면 렌더마다 타이머가 재설정돼 자동 접힘이 동작하지 않는다.
  }, [onToggleCollapsed]);

  const getTimeTheme = () => {
    switch (timeState) {
      case "morning":
        return {
          period: "오전 집중 타임",
          bgClass: styles.morningTheme,
          subQuote: "커피 한 잔과 함께 오늘 오전을 차분하고 밀도 있게 시작해보세요.",
        };
      case "afternoon":
        return {
          period: "오후 소통 & 협업 타임",
          bgClass: styles.afternoonTheme,
          subQuote: "원활한 소통과 리듬감 있는 실행으로 오늘 목표를 향해 달려보세요.",
        };
      case "evening":
        return {
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
        title: "오늘 하루도 정말 수고 많으셨습니다",
        subText: "퇴근 전 핸드오프 상태를 남겨두면 내일 아침 업무를 바로 이어갈 수 있습니다.",
      };
    }
    if (urgentCount >= 2) {
      return {
        title: `긴급 조치가 필요한 업무 ${urgentCount}건이 있습니다`,
        subText: "마감이나 생애주기가 임박한 주요 업무부터 먼저 확인해 보세요.",
      };
    }
    if (taskCount >= 5) {
      return {
        title: `오늘 처리할 업무가 ${taskCount}개 있습니다`,
        subText: "에스프레소 한 잔과 함께 차근차근 정리하며 리듬감 있게 시작해 보세요.",
      };
    }
    return {
      title: "AI 바리스타가 오늘의 흐름을 정리했습니다",
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
            <span className={styles.statusDot} aria-hidden="true" />
            {theme.period}
          </span>
          <span className={styles.dateText}>{dateLabel}</span>
        </div>
        <div className={styles.headerRightGroup}>
          {weather && (
            <div className={styles.weatherBadge}>
              <span>{weather.city}</span>
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
        <div className={styles.cardBodyContent}>
          <div className={styles.cardBodyText}>
            <h2 className={styles.greetingTitle}>{nudge.title}</h2>
            <p className={styles.greetingSub}>{nudge.subText}</p>
          </div>
          <div className={styles.baristaAvatarWrapper}>
            <BaristaBrewing
              size={compact ? 56 : 72}
              isBrewing={true}
              showBubbleOnHover={true}
              personaName={personaName}
              presetId={presetId}
              onClick={() => {
                // 유휴 상태에서 저절로 뜨는 막간 토크 라운지를 아바타 클릭으로도 바로 부른다.
                window.dispatchEvent(new CustomEvent("coffeetide:summon-barista"));
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
