"use client";

import React, { RefObject } from "react";
import styles from "../../page.module.css";
import { DOCUMENT_INPUT_ACCEPT } from "@/lib/documents/formats";

/** 입력창에 `/`를 치면 뜨는 자동완성 목록 */
const SLASH_COMMANDS = [
  { name: "/connect", desc: "서비스 연동 상태와 실제 API 권한 진단" },
  { name: "/tools", desc: "모든 기기에서 사용하는 Cloud Tool 목록" },
  { name: "/clear", desc: "AI 대화 이력 초기화" },
  { name: "/status", desc: "현재 업무 상태 현황 요약" },
  { name: "/handoff", desc: "남은 업무 퇴근 보존 및 정리" },
  { name: "/reorder", desc: "남은 업무 AI 일정 재배치" },
  { name: "/help", desc: "슬래시 커맨드 도움말 출력" },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFocus: () => void;
  busy: boolean;

  onRunSlashCommand: (command: string) => void;
  onQuickBriefing: () => void;

  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadBusy: boolean;

  plusOpen: boolean;
  onTogglePlus: (open: boolean) => void;
  plusBtnRef: RefObject<HTMLButtonElement | null>;
  plusFirstItemRef: RefObject<HTMLButtonElement | null>;

  saveToDrive: boolean;
  onToggleSaveToDrive: () => void;
  googleConnected: boolean;
}

export function CopilotComposer({
  value,
  onChange,
  onSubmit,
  onFocus,
  busy,
  onRunSlashCommand,
  onQuickBriefing,
  fileInputRef,
  onFileChange,
  uploadBusy,
  plusOpen,
  onTogglePlus,
  plusBtnRef,
  plusFirstItemRef,
  saveToDrive,
  onToggleSaveToDrive,
  googleConnected,
}: Props) {
  const trimmed = value.trim();
  const slashMatches = trimmed.startsWith("/")
    ? SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(trimmed.toLowerCase()))
    : [];

  return (
    <div className={styles.copilotForm} style={{ position: "relative" }}>
      {slashMatches.length > 0 && (
        <div className={styles.commandMenu}>
          {slashMatches.map((cmd) => (
            <button
              key={cmd.name}
              type="button"
              className={styles.commandMenuItem}
              onClick={() => onRunSlashCommand(cmd.name)}
            >
              <span className={styles.commandName}>{cmd.name}</span>
              <span className={styles.commandDesc}>{cmd.desc}</span>
            </button>
          ))}
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        accept={DOCUMENT_INPUT_ACCEPT}
        style={{ display: "none" }}
        onChange={onFileChange}
      />

      <button
        ref={plusBtnRef}
        className={`${styles.btn} ${styles.plusBtn} ${plusOpen ? styles.plusBtnOpen : ""}`}
        onClick={() => onTogglePlus(!plusOpen)}
        disabled={uploadBusy}
        title="첨부·옵션"
        aria-label="첨부 및 옵션 메뉴"
        aria-expanded={plusOpen}
      >
        +
      </button>

      {plusOpen && (
        <>
          <div className={styles.plusBackdrop} onClick={() => onTogglePlus(false)} />
          <div className={styles.plusMenu} role="menu">
            <button
              ref={plusFirstItemRef}
              className={styles.plusMenuItem}
              role="menuitem"
              onClick={() => {
                onTogglePlus(false);
                fileInputRef.current?.click();
              }}
              disabled={uploadBusy}
            >
              파일 첨부
            </button>
            <button
              className={styles.plusMenuItem}
              role="menuitem"
              onClick={onToggleSaveToDrive}
              disabled={!googleConnected}
              title={
                googleConnected
                  ? undefined
                  : "Google 연동 후 드라이브 영구 저장을 쓸 수 있어요. 지금은 일회성 분석으로 업로드돼요."
              }
            >
              {saveToDrive ? "드라이브 영구 저장" : "일회성 분석"}
              <span
                className={`${styles.plusMenuState} ${saveToDrive ? "" : styles.plusMenuStateOff}`}
              >
                {saveToDrive ? "켜짐" : "꺼짐"}
              </span>
            </button>
            <button
              className={styles.plusMenuItem}
              role="menuitem"
              onClick={() => {
                onTogglePlus(false);
                onQuickBriefing();
              }}
              disabled={busy}
            >
              오늘 브리핑
            </button>
          </div>
        </>
      )}

      <input
        className={styles.input}
        placeholder="오늘 뭐 해야 해? · 내일 3시 회의 일정 등록해줘"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        disabled={busy}
        aria-label="AI 바리스타 질문 입력"
      />

      <button
        className={`${styles.btn} ${styles.btnPrimary}`}
        onClick={onSubmit}
        disabled={busy}
        title="질문"
        style={{
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 10 4 15 9 20"></polyline>
          <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
        </svg>
      </button>
    </div>
  );
}
