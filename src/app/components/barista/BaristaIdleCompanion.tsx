"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { CafeBaristaScene } from "./CafeBaristaScene";
import { IDLE_TALK_POOL, formatIdleTalkForPersona, IdleMessageItem } from "@/lib/ai/baristaIdleTalks";
import { getPersonaEffect } from "@/lib/ai/personaEffects";
import { AffectionBadge } from "./AffectionBadge";
import { addAffectionExp } from "@/lib/ai/affectionManager";
import styles from "../../page.module.css";

export interface BaristaIdleCompanionProps {
  presetId?: string;
  baristaName?: string;
  idleThresholdMs?: number; // 기본: 45초(45,000ms)
  onOpenCopilot?: () => void;
  onSendMessage?: (message: string) => Promise<string | undefined> | void;
  enabled?: boolean;
}

export function BaristaIdleCompanion({
  presetId = "karina",
  baristaName = "AI 바리스타",
  idleThresholdMs = 45000,
  onOpenCopilot,
  onSendMessage,
  enabled = true,
}: BaristaIdleCompanionProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isCardOpen, setIsCardOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<IdleMessageItem>(() => IDLE_TALK_POOL[0]);
  const [dynamicTalk, setDynamicTalk] = useState<{ title: string; content: string } | null>(null);
  const [inlineChat, setInlineChat] = useState<{
    userText: string;
    aiText?: string;
    isThinking: boolean;
  } | null>(null);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const [talkIndex, setTalkIndex] = useState(0);
  const [quickInput, setQuickInput] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const lastActivityRef = useRef<number>(Date.now());
  const isDismissedRecentlyRef = useRef<boolean>(false);

  // 동적 AI 유머 & 페르소나 토크 비동기 호출
  const fetchDynamicTalk = useCallback(async () => {
    try {
      setIsLoadingNext(true);
      const res = await fetch(
        `/api/ai/barista-talk?presetId=${encodeURIComponent(presetId)}&baristaName=${encodeURIComponent(baristaName)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data.title && data.content) {
          setDynamicTalk({ title: data.title, content: data.content });
          return;
        }
      }
    } catch {
      // 네트워크 장애 시 로컬 풀 사용
    } finally {
      setIsLoadingNext(false);
    }
  }, [presetId, baristaName]);

  // 새로운 대화 선택 (로컬 풀 순환 + 동적 생성 시도)
  const pickNextTalk = useCallback(() => {
    setInlineChat(null);
    setTalkIndex((prev) => {
      const next = (prev + 1) % IDLE_TALK_POOL.length;
      setCurrentItem(IDLE_TALK_POOL[next]);
      setDynamicTalk(null); // 로컬 값으로 즉시 리셋 후 백그라운드 API 호출
      return next;
    });
    void fetchDynamicTalk();
  }, [fetchDynamicTalk]);

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
        setIsCardOpen(false); // 처음에는 미니 아바타만 띄우고, 큰 창은 닫아둠
      }
    }, 3000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleActivity));
      clearInterval(checkInterval);
    };
  }, [enabled, idleThresholdMs, isVisible, pickNextTalk]);

  // 환영 카드 등 바리스타를 클릭하면 유휴 시간을 기다리지 않고 곧바로 등장
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

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = quickInput.trim();
    if (!msg || inlineChat?.isThinking) return;
    setQuickInput("");
    if (onSendMessage) {
      setInlineChat({
        userText: msg,
        isThinking: true,
      });
      try {
        const answer = await onSendMessage(msg);
        if (answer) {
          setInlineChat({
            userText: msg,
            aiText: answer,
            isThinking: false,
          });
        } else {
          setInlineChat((prev) => (prev ? { ...prev, isThinking: false } : null));
        }
      } catch {
        setInlineChat((prev) => (prev ? { ...prev, isThinking: false } : null));
      }
    } else {
      handleDismissAll();
      onOpenCopilot?.();
    }
  };

  if (!enabled || !isVisible) return null;

  // 동적으로 가져온 대사가 있으면 우선 사용하고, 없으면 로컬 최신 유머 풀 기반 포맷팅
  const localFormatted = formatIdleTalkForPersona(currentItem, presetId, baristaName);
  const thinkingMessage =
    presetId === "senior_dev"
      ? "*기계식 키보드를 타닥이며 생각 중...* ☕"
      : `*${baristaName}가 생각 중...* 💭`;

  const displayTitle = inlineChat
    ? `💬 ${baristaName}와 대화 중`
    : dynamicTalk?.title || localFormatted.title;
  const displayContent = inlineChat
    ? inlineChat.isThinking
      ? thinkingMessage
      : inlineChat.aiText || localFormatted.content
    : dynamicTalk?.content || localFormatted.content;

  return (
    <>
      {/* 탭바 우측 상단에 위치할 미니 마스코트 아바타 */}
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
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/barista/barista_male_3d_serving.jpg";
            }}
          />
        </div>
      </div>

      {/* 클릭 시 혹은 소환 시 열리는 거대한 카드 모달 (createPortal로 Body 레벨 렌더링) */}
      {isCardOpen && mounted && createPortal(
        <div
          className={styles.baristaIdleCard}
          style={{ maxWidth: 440 }}
          role="complementary"
          aria-label="바리스타 막간 토크 라운지"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.baristaIdleHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className={styles.baristaIdleTitle}>{displayTitle}</span>
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

          <div style={{ marginBottom: "10px" }}>
            <AffectionBadge presetId={presetId} baristaName={baristaName} />
          </div>

          <CafeBaristaScene
            baristaName={baristaName}
            presetId={presetId}
            title={null}
            description={displayContent}
            onOpenCopilot={handleChatClick}
            compact
          />

          {/* 💬 팝업 내 인라인 빠른 대화 전송 */}
          <form
            onSubmit={handleQuickSubmit}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "10px",
              background: "var(--card-hover, #f1f5f9)",
              border: "1px solid var(--border, #dde4ee)",
              borderRadius: "10px",
              padding: "4px 8px",
            }}
          >
            <input
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              disabled={inlineChat?.isThinking}
              placeholder={
                inlineChat?.isThinking
                  ? `${baristaName}가 답변을 준비하고 있어요...`
                  : `${baristaName}에게 메시지 보내기...`
              }
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "0.82rem",
                color: "var(--text, #111)",
                padding: "5px 4px",
              }}
            />
            <button
              type="submit"
              disabled={!quickInput.trim() || inlineChat?.isThinking}
              style={{
                background: quickInput.trim() && !inlineChat?.isThinking ? "var(--accent, #0891b2)" : "transparent",
                color: quickInput.trim() && !inlineChat?.isThinking ? "var(--accent-contrast, #fff)" : "var(--text-dim, #888)",
                border: "none",
                borderRadius: "6px",
                padding: "4px 10px",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: quickInput.trim() && !inlineChat?.isThinking ? "pointer" : "default",
                transition: "all 0.2s ease",
              }}
            >
              {inlineChat?.isThinking ? "생각 중..." : "전송"}
            </button>
          </form>

          <div className={styles.baristaIdleActions} style={{ marginTop: 8 }}>
            <button
              type="button"
              className={styles.baristaIdleActionBtn}
              onClick={pickNextTalk}
              disabled={isLoadingNext}
              title="다른 유머나 밈, 토막 상식 듣기"
            >
              {isLoadingNext ? "⏳ 새 토크 가져오는 중..." : "🔄 다른 얘기 더 듣기"}
            </button>
            <button
              type="button"
              className={`${styles.baristaIdleActionBtn} ${styles.baristaIdleActionPrimary}`}
              onClick={handleChatClick}
              title="AI 바리스타 대화창 열기"
            >
              💬 전체 대화창 열기
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
