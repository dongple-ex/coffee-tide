"use client";

import React, { useState } from "react";
import { TaskCapture } from "./TaskCapture";
import { MemoCapture } from "./MemoCapture";
import { ExpenseCapture } from "./ExpenseCapture";
import { VoiceCaptureSheet } from "./VoiceCaptureSheet";
import styles from "./QuickCapture.module.css";

export type QuickCaptureMode = "task" | "note" | "expense";

interface QuickCaptureProps {
  onAddTask: (title: string) => void;
  onExtractTasks: (text: string, saveToDrive: boolean) => Promise<void>;
  onSaveExpense: (expense: {
    title: string;
    amount: string;
    currency: string;
    category?: string;
    paymentMethod?: string;
    merchant?: string;
    occurredAt?: string;
  }) => Promise<void>;
  disabled?: boolean;
  isLoading?: boolean;
}

export const QuickCapture: React.FC<QuickCaptureProps> = ({
  onAddTask,
  onExtractTasks,
  onSaveExpense,
  disabled,
  isLoading,
}) => {
  const [mode, setMode] = useState<QuickCaptureMode>("task");
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);

  const handleTranscript = (transcriptText: string) => {
    if (mode === "task") {
      onAddTask(transcriptText);
    } else if (mode === "note") {
      void onExtractTasks(transcriptText, false);
    } else if (mode === "expense") {
      const parseAndSave = async () => {
        try {
          const res = await fetch("/api/expenses/parse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: transcriptText }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.draft?.amount) {
              await onSaveExpense({
                title: transcriptText,
                amount: data.draft.amount,
                currency: data.draft.currency || "KRW",
                category: data.draft.category,
                paymentMethod: data.draft.paymentMethod,
                merchant: data.draft.merchant,
                occurredAt: data.draft.occurredAt,
              });
            }
          }
        } catch {
          // ignore
        }
      };
      void parseAndSave();
    }
  };

  return (
    <div className={styles.quickCaptureContainer}>
      {/* 상단 탭 및 마이크 버튼 */}
      <div className={styles.tabHeader}>
        <div className={styles.tabButtonGroup}>
          <button
            type="button"
            onClick={() => setMode("task")}
            className={`${styles.tabButton} ${mode === "task" ? styles.tabButtonActive : ""}`}
          >
            업무
          </button>
          <button
            type="button"
            onClick={() => setMode("note")}
            className={`${styles.tabButton} ${mode === "note" ? styles.tabButtonActive : ""}`}
          >
            메모·회의록
          </button>
          <button
            type="button"
            onClick={() => setMode("expense")}
            className={`${styles.tabButton} ${mode === "expense" ? styles.tabButtonActive : ""}`}
          >
            비용
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsVoiceOpen(true)}
          disabled={disabled || isLoading}
          className={styles.micButton}
          title="음성으로 입력하기"
          aria-label="음성으로 입력하기"
        >
          <span>🎤</span>
          <span style={{ fontSize: "0.78rem" }}>음성 입력</span>
        </button>
      </div>

      {/* 선택된 모드의 입력 폼 */}
      {mode === "task" && (
        <TaskCapture
          onAddTask={onAddTask}
          disabled={disabled}
          isLoading={isLoading}
        />
      )}

      {mode === "note" && (
        <MemoCapture
          onExtractTasks={onExtractTasks}
          disabled={disabled}
          isLoading={isLoading}
        />
      )}

      {mode === "expense" && (
        <ExpenseCapture
          onSaveExpense={onSaveExpense}
          disabled={disabled}
          isLoading={isLoading}
        />
      )}

      {/* 음성 녹음 모달 */}
      <VoiceCaptureSheet
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        onTranscript={handleTranscript}
        targetMode={mode}
      />
    </div>
  );
};
