"use client";

import React, { useState } from "react";
import type { UnifiedData } from "@/lib/types/unified";
import { UiIcon } from "./UiIcon";
import { VoiceCaptureSheet } from "./quickCapture/VoiceCaptureSheet";
import { ExpenseCapture } from "./quickCapture/ExpenseCapture";
import { MeetingAnalysisSheet, MeetingAnalysisContext } from "./quickCapture/meeting/MeetingAnalysisSheet";
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
  const [isMeetingAnalysisOpen, setIsMeetingAnalysisOpen] = useState(false);
  const [isMeetingAnalyzing, setIsMeetingAnalyzing] = useState(false);
  const [voiceExpenseText, setVoiceExpenseText] = useState("");
  const [voiceExpenseVersion, setVoiceExpenseVersion] = useState(0);

  const handleAnalyzeMeeting = async (context: MeetingAnalysisContext) => {
    setIsMeetingAnalyzing(true);
    try {
      const res = await fetch("/api/ai/analyze-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...context, transcript: pasteText }),
      });
      if (res.ok) {
        // 성공 시 폼 초기화 및 시트 닫기
        onPasteTextChange("");
        setIsMeetingAnalysisOpen(false);
        // 서버에서 생성된 항목(요약본, 추출된 할일)은 서버 푸시(sync)로 클라이언트에 내려올 예정이거나, 
        // 성공 토스트 등을 보여줄 수 있습니다.
      } else {
        alert("회의록 분석에 실패했습니다.");
      }
    } catch (e) {
      alert("오류가 발생했습니다.");
    } finally {
      setIsMeetingAnalyzing(false);
    }
  };

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
              className={styles.btn}
              disabled={pasteBusy || !pasteText.trim()}
              onClick={onImportPaste}
              style={{ minHeight: 44, flex: 1, width: "100%" }}
            >
              {pasteBusy ? <CafeWait steps={dynamicPasteSteps} interval={1200} /> : "할 일 골라내기"}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!pasteText.trim()}
              onClick={() => setIsMeetingAnalysisOpen(true)}
              style={{ minHeight: 44, flex: 1, width: "100%" }}
            >
              AI로 회의록 정리
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

      <MeetingAnalysisSheet
        isOpen={isMeetingAnalysisOpen}
        onClose={() => setIsMeetingAnalysisOpen(false)}
        transcript={pasteText}
        onAnalyze={handleAnalyzeMeeting}
        isAnalyzing={isMeetingAnalyzing}
      />
    </div>
  );
}
