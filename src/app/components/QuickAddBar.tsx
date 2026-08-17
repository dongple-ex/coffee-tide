"use client";

import React, { useState } from "react";
import type { UnifiedData } from "@/lib/types/unified";
import { UiIcon } from "./UiIcon";
import { VoiceCaptureSheet } from "./quickCapture/VoiceCaptureSheet";
import { ExpenseCapture } from "./quickCapture/ExpenseCapture";
import CafeWait from "./cafeWait";
import styles from "../page.module.css";
import captureStyles from "./quickCapture/QuickCapture.module.css";

export type QuickAddMode = "task" | "note" | "expense";

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
  onSaveExpense?: (expense: {
    itemId?: string;
    title: string;
    amount: string;
    currency: string;
    category?: string;
    paymentMethod?: string;
    merchant?: string;
    occurredAt?: string;
  }) => Promise<void>;
  onStoredVoiceItem?: (item: UnifiedData, warnings: string[]) => void;
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
  onSaveExpense,
  onStoredVoiceItem,
}: QuickAddBarProps) {
  const [activeMode, setActiveMode] = useState<QuickAddMode>("task");
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [voiceExpenseText, setVoiceExpenseText] = useState("");
  const [voiceExpenseVersion, setVoiceExpenseVersion] = useState(0);

  const handleVoiceTranscript = (transcriptText: string) => {
    if (activeMode === "task") {
      onQuickTitleChange(transcriptText);
    } else if (activeMode === "note") {
      onPasteTextChange(transcriptText);
      if (!showPaste) onToggleShowPaste();
    } else if (activeMode === "expense" && onSaveExpense) {
      setVoiceExpenseText(transcriptText);
      setVoiceExpenseVersion((version) => version + 1);
    }
  };

  return (
    <div>
      <div
        className={styles.cardTitle}
        style={{ display: "flex", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className={styles.sectionTitleLabel}>
            <UiIcon name="plus" size={17} />빠른 추가
          </span>
          {/* 모드 전환 탭 */}
          <div className={captureStyles.tabButtonGroup} style={{ marginLeft: 8 }}>
            <button
              type="button"
              onClick={() => {
                setActiveMode("task");
                if (showPaste) onToggleShowPaste();
              }}
              className={`${captureStyles.tabButton} ${activeMode === "task" ? captureStyles.tabButtonActive : ""}`}
              style={{ padding: "4px 10px", fontSize: "0.76rem" }}
            >
              업무
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode("note");
                if (!showPaste) onToggleShowPaste();
              }}
              className={`${captureStyles.tabButton} ${activeMode === "note" ? captureStyles.tabButtonActive : ""}`}
              style={{ padding: "4px 10px", fontSize: "0.76rem" }}
            >
              메모·회의록
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode("expense");
                if (showPaste) onToggleShowPaste();
              }}
              className={`${captureStyles.tabButton} ${activeMode === "expense" ? captureStyles.tabButtonActive : ""}`}
              style={{ padding: "4px 10px", fontSize: "0.76rem" }}
            >
              비용
            </button>
          </div>
        </div>

      </div>

      {activeMode === "task" && (
        <div className={`${styles.formRow} ${styles.quickTaskFormRow}`}>
          <input
            className={styles.input}
            placeholder="예: 내일까지 주간 보고서 제출"
            value={quickTitle}
            onChange={(e) => onQuickTitleChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAddManual()}
            aria-label="빠른 업무 추가 입력"
            style={{ minHeight: 44 }}
          />
          <button
            type="button"
            className={`${styles.btn} ${styles.cardTitleBtn} ${styles.voiceInputButton}`}
            onClick={() => setIsVoiceOpen(true)}
            style={{ minHeight: 44, minWidth: 44 }}
            title="음성으로 업무 입력하기"
            aria-label="음성으로 업무 입력하기"
          >
            <UiIcon name="microphone" size={20} />
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onAddManual}
            style={{ minHeight: 44, minWidth: 44 }}
          >
            추가
          </button>
        </div>
      )}

      {activeMode === "expense" && onSaveExpense && (
        <ExpenseCapture
          key={`expense-${voiceExpenseVersion}`}
          onSaveExpense={onSaveExpense}
          isLoading={pasteBusy}
          initialText={voiceExpenseText}
          onInitialTextConsumed={() => setVoiceExpenseText("")}
          onRequestVoice={() => setIsVoiceOpen(true)}
        />
      )}

      {showPaste && activeMode !== "expense" && (
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
          <div className={styles.quickActionRow}>
            <button
              type="button"
              className={`${styles.btn} ${styles.voiceInputButton}`}
              onClick={() => setIsVoiceOpen(true)}
              style={{ minHeight: 44, minWidth: 44, width: 44, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              title="음성으로 메모·회의록 입력하기"
              aria-label="음성으로 메모·회의록 입력하기"
            >
              <UiIcon name="microphone" size={20} />
            </button>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={pasteBusy || !pasteText.trim()}
              onClick={onImportPaste}
              style={{ minHeight: 44, flex: 1, width: "100%" }}
            >
              {pasteBusy ? <CafeWait steps={dynamicPasteSteps} interval={1200} /> : "할 일 골라내기"}
            </button>
          </div>
        </div>
      )}

      <VoiceCaptureSheet
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        onTranscript={handleVoiceTranscript}
        onStoredVoiceItem={onStoredVoiceItem}
        targetMode={activeMode}
      />
    </div>
  );
}
