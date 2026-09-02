"use client";

import React, { useState } from "react";
import type { KnowledgeEvidence } from "@/lib/knowledge/contracts";
import styles from "./EvidencePanel.module.css";

interface EvidencePanelProps {
  evidences?: KnowledgeEvidence[];
  inferenceNote?: string;
  onCompleteItem?: (id: string) => void;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  evidences = [],
  inferenceNote,
  onCompleteItem,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  if ((!evidences || evidences.length === 0) && !inferenceNote) {
    return null;
  }

  const handleComplete = (id: string) => {
    if (onCompleteItem) {
      onCompleteItem(id);
      setCompletedIds((prev) => new Set(prev).add(id));
    }
  };

  return (
    <div className={styles.evidencePanel}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={styles.toggleButton}
        aria-expanded={isOpen}
      >
        <span className={styles.toggleLabel}>
          <span className={styles.toggleIcon}>◆</span>
          <span>답변 근거 자료 ({evidences.length}건)</span>
        </span>
        <span className={styles.toggleState}>
          {isOpen ? "▲ 접기" : "▼ 근거 확인"}
        </span>
      </button>

      {isOpen && (
        <div className={styles.evidenceList}>
          {evidences.map((ev) => {
            const isCompleted = completedIds.has(ev.itemId);
            return (
              <div key={ev.itemId} className={styles.evidenceCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.evidenceTitle}>{ev.title}</span>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span className={styles.reasonBadge}>
                      {ev.scoreReason === "relation" ? "연관 관계" : "키워드 일치"}
                    </span>
                    {onCompleteItem && (
                      <button
                        type="button"
                        onClick={() => handleComplete(ev.itemId)}
                        disabled={isCompleted}
                        className={`${styles.completeBtn} ${isCompleted ? styles.completeBtnDone : ""}`}
                      >
                        {isCompleted ? "✓ 완료됨" : "완료 처리"}
                      </button>
                    )}
                  </div>
                </div>
                <p className={styles.evidenceExcerpt}>{ev.excerpt}</p>
              </div>
            );
          })}

          {inferenceNote && (
            <div className={styles.inferenceNote}>
              <strong>AI 추론 안내:</strong> {inferenceNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
