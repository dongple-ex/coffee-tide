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
    <div className={styles.badgeContainer}>
      {/* 🎊 레벨업 축하 배너 */}
      {isLevelUpAlert && (
        <div className={styles.levelUpBanner}>
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
      <div className={styles.progressBarTrack}>
        <div
          className={styles.progressBarFill}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* 실시간 획득 EXP 알림 */}
      {showToastGlow && lastGainedText && (
        <div className={styles.toastGlow}>
          <span>✨</span>
          <span>{lastGainedText}</span>
        </div>
      )}

      {/* 🎁 현재 레벨 해금 혜택 및 시크릿 대사 카드 */}
      {showPerksDetail && (
        <div className={styles.perksDetailCard}>
          <div className={styles.perksTitle}>
            <span>{levelInfo.rewardPerk.icon}</span>
            <span>해금 혜택: {levelInfo.rewardPerk.name}</span>
          </div>
          <div className={styles.perksDescription}>
            {levelInfo.rewardPerk.description}
          </div>
          {levelInfo.secretQuote && (
            <div className={styles.secretQuoteBox}>
              💬 {levelInfo.secretQuote}
            </div>
          )}
          <div className={styles.perksFooter}>
            <button
              type="button"
              onClick={() => setShowMemoryModal(true)}
              className={styles.memoryManageBtn}
            >
              <span>🧠</span>
              <span>장기 기억 관리</span>
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
