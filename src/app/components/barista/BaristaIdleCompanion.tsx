"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { CafeBaristaScene } from "./CafeBaristaScene";
import { IDLE_TALK_POOL, formatIdleTalkForPersona, IdleMessageItem } from "@/lib/ai/baristaIdleTalks";
import styles from "../../page.module.css";

export interface BaristaIdleCompanionProps {
  presetId?: string;
  baristaName?: string;
  idleThresholdMs?: number; // 기본: 45초 (45,000ms)
  onOpenCopilot?: () => void;
  enabled?: boolean;
}

export function BaristaIdleCompanion({
  presetId = "karina",
  baristaName = "AI 바리스타",
  idleThresholdMs = 45000,
  onOpenCopilot,
  enabled = true,
}: BaristaIdleCompanionProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [currentItem, setCurrentItem] = useState<IdleMessageItem>(() => IDLE_TALK_POOL[0]);
  const [talkIndex, setTalkIndex] = useState(0);

  const lastActivityRef = useRef<number>(Date.now());
  const isDismissedRecentlyRef = useRef<boolean>(false);

  // 무작위 새로운 대사 선택
  const pickNextTalk = useCallback(() => {
    setTalkIndex((prev) => {
      const next = (prev + 1) % IDLE_TALK_POOL.length;
      setCurrentItem(IDLE_TALK_POOL[next]);
      return next;
    });
  }, []);

  // 유휴 타이머 및 활동 감지
  useEffect(() => {
    if (!enabled) {
      setIsVisible(false);
      return;
    }

    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ["mousemove", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, handleActivity, { passive: true }));

    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= idleThresholdMs && !isVisible && !isDismissedRecentlyRef.current) {
        pickNextTalk();
        setIsVisible(true);
      }
    }, 3000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleActivity));
      clearInterval(checkInterval);
    };
  }, [enabled, idleThresholdMs, isVisible, pickNextTalk]);

  // 환영 카드의 바리스타를 클릭하면 유휴 시간을 기다리지 않고 곧바로 등장한다.
  useEffect(() => {
    if (!enabled) return;

    const handleSummon = () => {
      pickNextTalk();
      setIsVisible(true);
      isDismissedRecentlyRef.current = false;
      lastActivityRef.current = Date.now();
    };

    window.addEventListener("coffeetide:summon-barista", handleSummon);
    return () => window.removeEventListener("coffeetide:summon-barista", handleSummon);
  }, [enabled, pickNextTalk]);

  const handleDismiss = () => {
    setIsVisible(false);
    isDismissedRecentlyRef.current = true;
    lastActivityRef.current = Date.now();
    // 1분간은 다시 뜨지 않도록 쿨다운
    setTimeout(() => {
      isDismissedRecentlyRef.current = false;
    }, 60000);
  };

  const handleChatClick = () => {
    handleDismiss();
    onOpenCopilot?.();
  };

  if (!enabled || !isVisible) return null;

  const formatted = formatIdleTalkForPersona(currentItem, presetId, baristaName);

  return (
    <div
      className={styles.baristaIdleCard}
      style={{ maxWidth: 440 }}
      role="complementary"
      aria-label="바리스타 막간 토크 라운지"
    >
      <div className={styles.baristaIdleHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className={styles.baristaIdleTitle}>{formatted.title}</span>
        </div>
        <button
          type="button"
          className={styles.baristaIdleCloseBtn}
          onClick={handleDismiss}
          aria-label="막간 토크 닫기"
          title="닫기"
        >
          ✕
        </button>
      </div>

      {/* 카드 헤더에 이미 제목이 있으므로 씬 안에서는 제목 줄을 그리지 않는다.
          벨을 울리면 그 자리에 페르소나별 서빙 문구가 대신 표시된다. */}
      <CafeBaristaScene
        baristaName={baristaName}
        presetId={presetId}
        title={null}
        description={formatted.content}
        onOpenCopilot={handleChatClick}
        compact
      />

      <div className={styles.baristaIdleActions} style={{ marginTop: 10 }}>
        <button
          type="button"
          className={styles.baristaIdleActionBtn}
          onClick={pickNextTalk}
          title="다른 농담이나 토막 상식 보기"
        >
          ☕ 딴 얘기 해줘
        </button>
        <button
          type="button"
          className={`${styles.baristaIdleActionBtn} ${styles.baristaIdleActionPrimary}`}
          onClick={handleChatClick}
          title="AI 바리스타 대화창 열기"
        >
          💬 바로 대화하기
        </button>
      </div>
    </div>
  );
}
