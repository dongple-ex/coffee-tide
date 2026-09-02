"use client";

import React, { useState, useEffect } from "react";
import {
  getAffectionState,
  calculateLevelInfo,
  PersonaAffectionState,
} from "@/lib/ai/affectionManager";
import { CompanionLevelUpModal } from "@/app/components/companion/CompanionLevelUpModal";
import { CompanionMemoryModal } from "@/app/components/companion/CompanionMemoryModal";
import styles from "./AffectionBadge.module.css";

interface Props {
  presetId?: string;
  baristaName?: string;
  compact?: boolean;
}

export function AffectionBadge({
  presetId = "karina",
  baristaName = "AI 바리스타",
  compact = false,
}: Props) {
  const [affection, setAffection] = useState<PersonaAffectionState>(() => getAffectionState(presetId));
  const [showToastGlow, setShowToastGlow] = useState(false);
  const [lastGainedText, setLastGainedText] = useState<string | null>(null);
  const [isLevelUpAlert, setIsLevelUpAlert] = useState(false);
  const [showPerksDetail, setShowPerksDetail] = useState(false);
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [levelUpLevel, setLevelUpLevel] = useState<number>(1);

  useEffect(() => {
    setAffection(getAffectionState(presetId));
  }, [presetId]);

  // 실시간 호감도 변경 및 레벨업 이벤트 리스너
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.presetId === presetId) {
        setAffection(getAffectionState(presetId));
        setLastGainedText(`+${customEvent.detail.gainedExp} EXP (${customEvent.detail.actionLabel})`);
        setShowToastGlow(true);

        if (customEvent.detail.isLevelUp) {
          setIsLevelUpAlert(true);
          setLevelUpLevel(customEvent.detail.levelInfo?.level || 2);
          setShowLevelUpModal(true);
          setTimeout(() => setIsLevelUpAlert(false), 5000);
        }

        setTimeout(() => {
          setShowToastGlow(false);
          setLastGainedText(null);
        }, 3500);
      }
    };

    window.addEventListener("coffeetide:affection-updated", handleUpdate);
    return () => window.removeEventListener("coffeetide:affection-updated", handleUpdate);
  }, [presetId]);

  const { levelInfo, progressPercent, currentLevelExp, nextLevelNeededExp, isMaxLevel } =
    calculateLevelInfo(affection.exp);

  if (compact) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "3px 8px",
          borderRadius: "12px",
          background: "rgba(244, 63, 94, 0.12)",
          border: "1px solid rgba(244, 63, 94, 0.25)",
          fontSize: "0.76rem",
          color: "#fda4af",
          cursor: "pointer",
        }}
        onClick={() => setShowPerksDetail(!showPerksDetail)}
        title={`호감도: ${affection.exp} EXP (${levelInfo.title}) - 클릭하여 혜택 보기`}
      >
        <span>💖 {levelInfo.badge}</span>
        <span style={{ fontWeight: 600 }}>{levelInfo.title}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "10px 14px",
        borderRadius: "12px",
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.09)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 🎊 레벨업 축하 배너 */}
      {isLevelUpAlert && (
        <div
          style={{
            padding: "6px 10px",
            borderRadius: "8px",
            background: "linear-gradient(90deg, #f59e0b 0%, #ec4899 100%)",
            color: "#fff",
            fontSize: "0.8rem",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            animation: "bounce 0.5s ease",
          }}
        >
          <span>🎉 {baristaName}와의 관계 레벨업! [{levelInfo.badge} {levelInfo.title}]</span>
          <span>✨</span>
        </div>
      )}

      <div className={styles.summaryRow}>
        <div
          className={styles.identitySummary}
          onClick={() => setShowPerksDetail(!showPerksDetail)}
          title="클릭하여 레벨별 해금 혜택 확인"
        >
          <span className={styles.heartIcon}>💖</span>
          <span className={styles.levelLabel}>
            {levelInfo.badge} {levelInfo.title}
          </span>
          <span className={styles.taskCount}>
            ({affection.completedTasksCount}개 업무 완료)
          </span>
          <span className={styles.perksToggle}>
            {showPerksDetail ? "▲" : "▼ 혜택"}
          </span>
        </div>
        <div className={styles.expSummary}>
          {isMaxLevel ? "MAX 1000 EXP" : `${currentLevelExp} / ${nextLevelNeededExp} EXP (${progressPercent}%)`}
        </div>
      </div>

      {/* 호감도 프로그레스 바 */}
      <div
        style={{
          width: "100%",
          height: "6px",
          borderRadius: "3px",
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progressPercent}%`,
            height: "100%",
            borderRadius: "3px",
            background: "linear-gradient(90deg, #f43f5e 0%, #ec4899 50%, #38bdf8 100%)",
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {/* 실시간 획득 EXP 알림 */}
      {showToastGlow && lastGainedText && (
        <div
          style={{
            fontSize: "0.74rem",
            color: "#4ade80",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span>✨</span>
          <span>{lastGainedText}</span>
        </div>
      )}

      {/* 🎁 현재 레벨 해금 혜택 및 시크릿 대사 카드 */}
      {showPerksDetail && (
        <div
          style={{
            marginTop: "6px",
            padding: "8px 10px",
            borderRadius: "8px",
            background: "rgba(0, 0, 0, 0.25)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            fontSize: "0.78rem",
            display: "flex",
            flexDirection: "column",
            gap: "5px",
          }}
        >
          <div style={{ color: "var(--accent, #38bdf8)", fontWeight: 700 }}>
            {levelInfo.rewardPerk.icon} 해금 혜택: {levelInfo.rewardPerk.name}
          </div>
          <div style={{ color: "var(--text-dim, #aaa)", fontSize: "0.74rem" }}>
            {levelInfo.rewardPerk.description}
          </div>
          {levelInfo.secretQuote && (
            <div style={{ fontStyle: "italic", color: "#fda4af", fontSize: "0.74rem", marginTop: "2px" }}>
              💬 {levelInfo.secretQuote}
            </div>
          )}
          <div style={{ marginTop: "4px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "4px", display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setShowMemoryModal(true)}
              style={{
                background: "transparent",
                border: "none",
                color: "#38bdf8",
                fontSize: "0.74rem",
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              🧠 장기 기억 관리
            </button>
          </div>
        </div>
      )}

      {/* 🎊 레벨업 축하 모달 */}
      <CompanionLevelUpModal
        isOpen={showLevelUpModal}
        onClose={() => setShowLevelUpModal(false)}
        personaId={presetId}
        baristaName={baristaName}
        newLevel={levelUpLevel}
      />

      {/* 🧠 기억 관리 모달 */}
      <CompanionMemoryModal
        isOpen={showMemoryModal}
        onClose={() => setShowMemoryModal(false)}
      />
    </div>
  );
}
