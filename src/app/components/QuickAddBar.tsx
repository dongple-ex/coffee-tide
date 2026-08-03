"use client";

import React from "react";
import CafeWait from "./cafeWait";
import styles from "../page.module.css";

export interface QuickAddBarProps {
  quickTitle: string;
  onQuickTitleChange: (val: string) => void;
  onAddManual: () => void;
  showPaste: boolean;
  onToggleShowPaste: () => void;
  pasteText: string;
  onPasteTextChange: (val: string) => void;
  pasteBusy: boolean;
  onImportPaste: () => void;
  dynamicPasteSteps: string[];
}

export function QuickAddBar({
  quickTitle,
  onQuickTitleChange,
  onAddManual,
  showPaste,
  onToggleShowPaste,
  pasteText,
  onPasteTextChange,
  pasteBusy,
  onImportPaste,
  dynamicPasteSteps,
}: QuickAddBarProps) {
  return (
    <div>
      <div
        className={styles.cardTitle}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}
      >
        <span>⚡ 빠른 업무 추가</span>
        <button
          type="button"
          className={`${styles.btn} ${styles.cardTitleBtn}`}
          onClick={onToggleShowPaste}
          aria-expanded={showPaste}
          style={{ fontSize: "0.78rem", padding: "4px 10px" }}
        >
          {showPaste ? "접기" : "📋 메모/회의록 붙여넣기"}
        </button>
      </div>

      <div className={styles.formRow}>
        <input
          className={styles.input}
          placeholder="예: 내일까지 주간 보고서 제출"
          value={quickTitle}
          onChange={(e) => onQuickTitleChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAddManual()}
          aria-label="빠른 업무 추가 입력"
        />
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onAddManual}>
          추가
        </button>
      </div>

      {showPaste && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            background: "rgba(0, 0, 0, 0.02)",
            borderRadius: 10,
            border: "1px dashed var(--border)",
          }}
        >
          <textarea
            className={styles.textarea}
            placeholder="메모·메일·회의록을 붙여넣으면 할 일만 쏙 골라낼게요"
            value={pasteText}
            onChange={(e) => onPasteTextChange(e.target.value)}
            aria-label="붙여넣기 가져오기 입력"
          />
          <div className={styles.formRow} style={{ marginTop: 8 }}>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={pasteBusy || !pasteText.trim()}
              onClick={onImportPaste}
            >
              {pasteBusy ? <CafeWait steps={dynamicPasteSteps} interval={1200} /> : "할 일 골라내기"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
