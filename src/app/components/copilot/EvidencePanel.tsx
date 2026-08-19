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
                        style={{
                          fontSize: "0.7rem",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: isCompleted ? "1px solid #10b981" : "1px solid #4b5563",
                          backgroundColor: isCompleted ? "rgba(16, 185, 129, 0.1)" : "transparent",
                          color: isCompleted ? "#10b981" : "var(--text-muted, #a1a1aa)",
                          cursor: isCompleted ? "default" : "pointer",
                        }}
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
