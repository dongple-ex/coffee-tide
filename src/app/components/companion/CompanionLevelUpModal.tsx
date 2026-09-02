"use client";

import React from "react";
import { RELATIONSHIP_LEVEL_SPECS, PERSONA_TRANSITION_SCENES } from "@/lib/companion/relationshipEngine";
import styles from "./CompanionLevelUpModal.module.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  personaId?: string;
  baristaName?: string;
  newLevel: number;
}

export function CompanionLevelUpModal({
  isOpen,
  onClose,
  personaId = "karina",
  baristaName = "카리나",
  newLevel,
}: Props) {
  if (!isOpen) return null;

  const spec = RELATIONSHIP_LEVEL_SPECS.find((s) => s.level === newLevel) || RELATIONSHIP_LEVEL_SPECS[0];
  const scene = PERSONA_TRANSITION_SCENES[personaId]?.[newLevel] || {
    narration: "*눈을 반짝이며 환하게 미소 짓고*",
    quote: spec.secretQuote,
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.celebrationIcon}>🎊</div>
        <span className={styles.levelUpTag}>
          RELATIONSHIP LEVEL UP!
        </span>
        <h2 className={styles.levelTitle}>
          {spec.badge} {spec.title} 달성!
        </h2>
        <p className={styles.levelDescription}>
          {spec.description}
        </p>

        {/* 혜택 안내 박스 */}
        <div className={styles.perkBox}>
          <div className={styles.perkTag}>
            🎁 새로운 해금 혜택
          </div>
          <div className={styles.perkText}>
            {spec.perkDescription}
          </div>
        </div>

        {/* 캐릭터 전이 대사 */}
        <div className={styles.sceneBox}>
          <div className={styles.sceneNarration}>
            {scene.narration}
          </div>
          <div className={styles.sceneQuote}>
            &ldquo;{scene.quote}&rdquo;
          </div>
          <div className={styles.sceneAuthor}>
            — {baristaName}
          </div>
        </div>

        {/* 닫기 버튼 */}
        <button
          type="button"
          onClick={onClose}
          className={styles.confirmButton}
        >
          계속해서 함께 일하기 ✨
        </button>
      </div>
    </div>
  );
}
