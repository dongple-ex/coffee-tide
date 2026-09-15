"use client";

import React, { useState, useCallback } from "react";
import styles from "./ScratchpadWidget.module.css";
import { UiIcon } from "../UiIcon";

export interface ScratchpadWidgetProps {
  /** 스크래치패드 내용을 오늘 업무 목록에 추가 */
  onAddTodo?: (text: string) => void;
  /** 스크래치패드 내용을 바탕으로 AI 캔버스 새 문서 열기 */
  onOpenInCanvas?: (title: string, content: string) => void;
  /** 스크래치패드 내용을 AI 바리스타 질문창에 주입 */
  onSendToBarista?: (text: string) => void;
  className?: string;
}

const LS_SCRATCHPAD_CONTENT = "ct_scratchpad_content";
const LS_SCRATCHPAD_OPEN = "ct_scratchpad_open";

/**
 * Antigravity 2.13.0의 Scratch Files 패턴을 벤치마킹한 접이식 스크래치패드 위젯
 * - 정식 업무 목록을 어지럽히지 않고 임시 메모/아이디어/클립보드 내용을 보관
 * - 원클릭으로 정식 To-do 등록 또는 AI 캔버스/바리스타로 승격(Promote)
 */
export function ScratchpadWidget({
  onAddTodo,
  onOpenInCanvas,
  onSendToBarista,
  className,
}: ScratchpadWidgetProps) {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const savedOpen = localStorage.getItem(LS_SCRATCHPAD_OPEN);
      return savedOpen !== null ? savedOpen === "true" : false;
    } catch {
      return false;
    }
  });

  const [content, setContent] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(LS_SCRATCHPAD_CONTENT) || "";
    } catch {
      return "";
    }
  });

  const [hasSavedNotice, setHasSavedNotice] = useState(false);

  // 내용 변경 시 로컬 스토리지 저장
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    try {
      localStorage.setItem(LS_SCRATCHPAD_CONTENT, val);
    } catch {
      // ignore
    }
  };

  // 접기/펼치기 토글
  const toggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LS_SCRATCHPAD_OPEN, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // 1. To-do 등록
  const handleAddAsTodo = useCallback(() => {
    if (!content.trim()) return;
    if (onAddTodo) {
      onAddTodo(content.trim());
      setHasSavedNotice(true);
      setTimeout(() => setHasSavedNotice(false), 2000);
    }
  }, [content, onAddTodo]);

  // 2. 캔버스에서 열기
  const handleOpenCanvas = useCallback(() => {
    if (!content.trim()) return;
    if (onOpenInCanvas) {
      const firstLine = content.trim().split("\n")[0].slice(0, 30);
      const title = firstLine.replace(/^[#\s\-*]+/, "") || "스크래치 메모";
      onOpenInCanvas(title, content);
    }
  }, [content, onOpenInCanvas]);

  // 3. 바리스타에게 질문
  const handleSendBarista = useCallback(() => {
    if (!content.trim()) return;
    if (onSendToBarista) {
      onSendToBarista(content.trim());
    }
  }, [content, onSendToBarista]);

  // 4. 비우기
  const handleClear = useCallback(() => {
    if (!content.trim()) return;
    if (window.confirm("스크래치패드의 내용을 비우시겠습니까?")) {
      setContent("");
      try {
        localStorage.removeItem(LS_SCRATCHPAD_CONTENT);
      } catch {
        // ignore
      }
    }
  }, [content]);

  const charCount = content.length;
  const isFilled = content.trim().length > 0;

  return (
    <div className={`${styles.container} ${className || ""}`}>
      <div
        className={styles.header}
        onClick={toggleOpen}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-label="임시 스크래치패드 토글"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleOpen();
          }
        }}
      >
        <div className={styles.titleArea}>
          <span>📝 임시 스크래치패드</span>
          {isFilled && <span className={styles.badge}>메모 있음</span>}
          {hasSavedNotice && <span className={styles.badge}>✓ 업무 등록됨</span>}
        </div>
        <div className={styles.headerRight}>
          {charCount > 0 && <span className={styles.charCount}>{charCount}자</span>}
          <span className={`${styles.toggleIcon} ${isOpen ? styles.toggleIconOpen : ""}`}>
            ▼
          </span>
        </div>
      </div>

      {isOpen && (
        <div className={styles.body}>
          <textarea
            className={styles.textarea}
            value={content}
            onChange={handleChange}
            placeholder="정식 업무 등록 전의 아이디어 조각, 복사한 텍스트, 빠른 메모를 자유롭게 적어두세요. (자동 저장)"
            aria-label="스크래치패드 메모 내용"
          />

          <div className={styles.actions}>
            <div className={styles.actionGroup}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleAddAsTodo}
                disabled={!isFilled}
                title="오늘의 할 일 목록에 업무로 등록"
              >
                <UiIcon name="plus" size={13} />
                To-do로 등록
              </button>

              <button
                type="button"
                className={styles.btn}
                onClick={handleOpenCanvas}
                disabled={!isFilled}
                title="이 내용을 AI 캔버스로 가져가서 다듬기"
              >
                <UiIcon name="pencil" size={13} />
                캔버스에서 열기
              </button>

              <button
                type="button"
                className={styles.btn}
                onClick={handleSendBarista}
                disabled={!isFilled}
                title="이 내용을 AI 바리스타에게 질문으로 전달"
              >
                <UiIcon name="assistant" size={13} />
                바리스타에 질문
              </button>
            </div>

            <button
              type="button"
              className={`${styles.btn} ${styles.btnClear}`}
              onClick={handleClear}
              disabled={!isFilled}
              title="스크래치패드 비우기"
            >
              <UiIcon name="trash" size={13} />
              비우기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
