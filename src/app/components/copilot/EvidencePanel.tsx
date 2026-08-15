"use client";

import React, { useState } from "react";
import type { KnowledgeEvidence } from "@/lib/knowledge/contracts";
import styles from "./EvidencePanel.module.css";

interface EvidencePanelProps {
  evidences?: KnowledgeEvidence[];
  inferenceNote?: string;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  evidences = [],
  inferenceNote,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if ((!evidences || evidences.length === 0) && !inferenceNote) {
    return null;
  }

  return (
    <div className={styles.evidencePanel}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={styles.toggleButton}
        aria-expanded={isOpen}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
          <span style={{ color: "#a5b4fc", fontSize: "0.75rem" }}>◆</span>
          답변 근거 자료 ({evidences.length}건)
        </span>
        <span style={{ fontSize: "0.74rem", color: "var(--text-muted, #a1a1aa)" }}>
          {isOpen ? "▲ 접기" : "▼ 근거 확인"}
        </span>
      </button>

      {isOpen && (
        <div className={styles.evidenceList}>
          {evidences.map((ev) => (
            <div key={ev.itemId} className={styles.evidenceCard}>
              <div className={styles.cardHeader}>
                <span className={styles.evidenceTitle}>{ev.title}</span>
                <span className={styles.reasonBadge}>
                  {ev.scoreReason === "relation" ? "연관 관계" : "키워드 일치"}
                </span>
              </div>
              <p className={styles.evidenceExcerpt}>{ev.excerpt}</p>
            </div>
          ))}

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
