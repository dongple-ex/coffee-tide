"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { CafeBaristaScene } from "./CafeBaristaScene";
import { IDLE_TALK_POOL, formatIdleTalkForPersona, IdleMessageItem } from "@/lib/ai/baristaIdleTalks";
import { getPersonaEffect } from "@/lib/ai/personaEffects";
import { UiIcon } from "../UiIcon";
import styles from "../../page.module.css";

export interface BaristaIdleCompanionProps {
  presetId?: string;
  baristaName?: string;
  idleThresholdMs?: number; // 기본: 45초(45,000ms)
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
  const [isCardOpen, setIsCardOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<IdleMessageItem>(() => IDLE_TALK_POOL[0]);
  const [talkIndex, setTalkIndex] = useState(0);

  const lastActivityRef = useRef<number>(Date.now());
  const isDismissedRecentlyRef = useRef<boolean>(false);

  // 무작위로 새로운 대화 선택
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
      setIsCardOpen(false);
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
        setIsCardOpen(false); // 처음에는 미니 마스코트만 띄우고, 큰 창은 닫아둠
      }
    }, 3000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleActivity));
      clearInterval(checkInterval);
    };
  }, [enabled, idleThresholdMs, isVisible, pickNextTalk]);

  // 환영 카드 등 바리스타를 클릭하면 유휴 시간을 기다리지 않고 곧바로 등장한다.
  useEffect(() => {
    if (!enabled) return;

    const handleSummon = () => {
      pickNextTalk();
      setIsVisible(true);
      setIsCardOpen(true);
      isDismissedRecentlyRef.current = false;
      lastActivityRef.current = Date.now();
    };

    window.addEventListener("coffeetide:summon-barista", handleSummon);
    return () => window.removeEventListener("coffeetide:summon-barista", handleSummon);
  }, [enabled, pickNextTalk]);

  const handleDismissCard = () => {
    setIsCardOpen(false);
  };

  const handleDismissAll = () => {
    setIsVisible(false);
    setIsCardOpen(false);
    isDismissedRecentlyRef.current = true;
    lastActivityRef.current = Date.now();
    // 1분간은 다시 뜨지 않도록 쿨다운
    setTimeout(() => {
      isDismissedRecentlyRef.current = false;
    }, 60000);
  };

  const handleChatClick = () => {
    handleDismissAll();
    onOpenCopilot?.();
  };

  if (!enabled || !isVisible) return null;

  const formatted = formatIdleTalkForPersona(currentItem, presetId, baristaName);

  return (
    <>
      {/* 탭바 우측 상단에 위치할 미니 마스코트 */}
      <div 
        className={styles.baristaIdleMascotContainer}
        onClick={(e) => e.stopPropagation()}
      >
        <div 
          className={styles.baristaIdleMascotCharacter} 
          onClick={(e) => {
            e.stopPropagation();
            setIsCardOpen((prev) => !prev);
          }}
          title="클릭해서 바리스타 톡 열기/닫기"
          style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", border: "2px solid #C57A57", backgroundColor: "#fff", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={getPersonaEffect(presetId, baristaName).avatarIdle} 
            alt={baristaName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/barista/barista_male_3d_serving.jpg";
            }}
          />
        </div>
      </div>

      {/* 클릭 시 혹은 소환 시 열리는 기존의 거대한 카드 모달 */}
      {isCardOpen && (
        <div
          className={styles.baristaIdleCard}
          style={{ maxWidth: 440 }}
          role="complementary"
          aria-label="바리스타 막간 토크 라운지"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.baristaIdleHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className={styles.baristaIdleTitle}>{formatted.title}</span>
            </div>
            <button
              type="button"
              className={styles.baristaIdleCloseBtn}
              onClick={handleDismissCard}
              aria-label="막간 토크 닫기"
              title="닫기"
            >
              ✕
            </button>
          </div>

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
              🔄 다른 얘기 더 듣기
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
      )}
    </>
  );
}
