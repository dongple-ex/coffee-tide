"use client";

import React, { useState } from "react";
import styles from "./QuickCapture.module.css";

interface TaskCaptureProps {
  onAddTask: (title: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export const TaskCapture: React.FC<TaskCaptureProps> = ({
  onAddTask,
  disabled,
  isLoading,
}) => {
  const [title, setTitle] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || disabled || isLoading) return;
    onAddTask(title.trim());
    setTitle("");
  };

  return (
    <form onSubmit={handleSubmit} className={styles.inputForm}>
      <div className={styles.inputRow}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="새로운 업무를 입력하세요 (예: 14시 디자인 리뷰 미팅)"
          disabled={disabled || isLoading}
          className={styles.textInput}
        />
        <button
          type="submit"
          disabled={!title.trim() || disabled || isLoading}
          className={styles.submitButton}
        >
          {isLoading ? "추가 중..." : "추가"}
        </button>
      </div>
    </form>
  );
};
