"use client";

import React, { useState } from "react";
import styles from "./QuickCapture.module.css";

interface MemoCaptureProps {
  onExtractTasks: (text: string, saveToDrive: boolean) => Promise<void>;
  disabled?: boolean;
  isLoading?: boolean;
}

export const MemoCapture: React.FC<MemoCaptureProps> = ({
  onExtractTasks,
  disabled,
  isLoading,
}) => {
  const [text, setText] = useState("");
  const [saveToDrive, setSaveToDrive] = useState(false);

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled || isLoading) return;
    await onExtractTasks(text.trim(), saveToDrive);
    setText("");
  };

  return (
    <form onSubmit={handleExtract} className={styles.inputForm}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="회의록이나 긴 메모 내용을 붙여넣으세요. AI가 핵심 업무를 추출합니다."
        rows={4}
        disabled={disabled || isLoading}
        className={styles.textArea}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={saveToDrive}
            onChange={(e) => setSaveToDrive(e.target.checked)}
            disabled={disabled || isLoading}
            style={{ width: 18, height: 18, cursor: "pointer" }}
          />
          <span>Google Drive 일자별 폴더에 원문 백업</span>
        </label>

        <button
          type="submit"
          disabled={!text.trim() || disabled || isLoading}
          className={styles.submitButton}
        >
          {isLoading ? "업무 추출 중..." : "업무 추출하기"}
        </button>
      </div>
    </form>
  );
};
