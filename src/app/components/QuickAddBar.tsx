"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import type { UnifiedData } from "@/lib/types/unified";
import { UiIcon } from "./UiIcon";
import type { MeetingAnalysisContext, MeetingAnalysisResult } from "./quickCapture/meeting/MeetingAnalysisSheet";
import { saveMeetingTasks, ActionItem, SaveTasksResult } from "./quickCapture/meeting/meetingTasks";

// 캡처 시트들은 처음 사용할 때에만 로드되도록 지연 로딩 처리 (초기 번들 축소)
const VoiceCaptureSheet = dynamic(
  () => import("./quickCapture/VoiceCaptureSheet").then((m) => m.VoiceCaptureSheet),
  { ssr: false }
);
const ExpenseCapture = dynamic(
  () => import("./quickCapture/ExpenseCapture").then((m) => m.ExpenseCapture),
  { ssr: false }
);
const MeetingAnalysisSheet = dynamic(
  () => import("./quickCapture/meeting/MeetingAnalysisSheet").then((m) => m.MeetingAnalysisSheet),
  { ssr: false }
);
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
  onSaveTaskItem?: (item: UnifiedData) => void;
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
  onSaveTaskItem,
}: QuickAddBarProps) {
  const [activeMode, setActiveMode] = useState<QuickAddMode>("task");
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isMeetingAnalysisOpen, setIsMeetingAnalysisOpen] = useState(false);
  const [isMeetingAnalyzing, setIsMeetingAnalyzing] = useState(false);
  const [voiceExpenseText, setVoiceExpenseText] = useState("");
  const [voiceExpenseVersion, setVoiceExpenseVersion] = useState(0);
  // 시트는 첫 오픈 시점에 마운트하고 이후에는 유지 — 닫아도 내부 상태(분석 결과 등)가 보존되도록 언마운트하지 않음
  const [voiceSheetMounted, setVoiceSheetMounted] = useState(false);
  const [meetingSheetMounted, setMeetingSheetMounted] = useState(false);

  const openVoiceSheet = () => {
    setVoiceSheetMounted(true);
    setIsVoiceOpen(true);
  };

  const openMeetingAnalysis = () => {
    setMeetingSheetMounted(true);
    setIsMeetingAnalysisOpen(true);
  };

  const handleAnalyzeMeeting = async (context: MeetingAnalysisContext) => {
    setIsMeetingAnalyzing(true);
    try {
      const res = await fetch("/api/ai/analyze-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...context, transcript: pasteText }),
      });
      if (res.ok) {
        const data = (await res.json()) as { analysis?: MeetingAnalysisResult } & MeetingAnalysisResult;
        return data.analysis ?? data;
      } else {
        alert("회의록 분석에 실패했습니다.");
        return null;
      }
    } catch {
      alert("오류가 발생했습니다.");
      return null;
    } finally {
      setIsMeetingAnalyzing(false);
    }
  };

  const handleSaveToDrive = async (context: MeetingAnalysisContext, result: MeetingAnalysisResult) => {
    try {
      const res = await fetch("/api/ai/save-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, transcript: pasteText, result })
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const handleSaveTasks = async (tasks: ActionItem[]): Promise<SaveTasksResult> => {
    return saveMeetingTasks(tasks, { onSaveTaskItem, onStoredVoiceItem });
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
            onClick={openVoiceSheet}
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
          onRequestVoice={openVoiceSheet}
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
              onClick={openVoiceSheet}
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
              onClick={openMeetingAnalysis}
              style={{ minHeight: 44, flex: 1, width: "100%" }}
            >
              AI로 회의록 정리
            </button>
          </div>
        </div>
      )}

      {voiceSheetMounted && (
        <VoiceCaptureSheet
          isOpen={isVoiceOpen}
          onClose={() => setIsVoiceOpen(false)}
          onTranscript={handleVoiceTranscript}
          onStoredVoiceItem={onStoredVoiceItem}
          targetMode={activeMode}
        />
      )}

      {meetingSheetMounted && (
        <MeetingAnalysisSheet
          isOpen={isMeetingAnalysisOpen}
          onClose={() => setIsMeetingAnalysisOpen(false)}
          transcript={pasteText}
          onAnalyze={handleAnalyzeMeeting}
          onSaveToDrive={handleSaveToDrive}
          onSaveTasks={handleSaveTasks}
          isAnalyzing={isMeetingAnalyzing}
        />
      )}
    </div>
  );
}
