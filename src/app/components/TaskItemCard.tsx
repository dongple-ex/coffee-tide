"use client";

import React, { useState } from "react";
import { ProcessedData } from "@/lib/automation/rules";
import { timeAgo } from "@/lib/mergeView";
import { CATEGORY_LABELS, SOURCE_LABELS, SubTask, UnifiedData } from "@/lib/types/unified";
import styles from "../page.module.css";

interface Props {
  item: ProcessedData & { overdue: number };
  busy: boolean;

  /** 본문 2줄 클램프 펼침 상태 (E2) */
  contentExpanded: boolean;
  onToggleContent: () => void;

  /** 워크노트 패널은 목록 전체에서 하나만 열린다 */
  workNoteOpen: boolean;
  onToggleWorkNote: () => void;
  workNote: string;
  onChangeWorkNote: (note: string) => void;

  subTasks: SubTask[];
  onAddSubTask: (title: string) => void;
  onToggleSubTask: (subId: string) => void;
  onRemoveSubTask: (subId: string) => void;

  /** 빠른 캡처 가능 여부 — 서버 연동 또는 브라우저 폴더 연결 상태에서 결정된다 */
  canCaptureObsidian: boolean;
  canCaptureNotion: boolean;

  onSetStatus: (status: UnifiedData["status"]) => void;
  onDelete: () => void;
  onReplyDraft: () => void;
  onCompleteExternal: () => void;
  onCapture: (target: "notion" | "obsidian") => void;
  onDismiss: () => void;

  rawContentOpen?: boolean;
  onToggleRawContent?: () => void;
  rawText?: string;
}

export function TaskItemCard({
  item,
  busy,
  contentExpanded,
  onToggleContent,
  workNoteOpen,
  onToggleWorkNote,
  workNote,
  onChangeWorkNote,
  subTasks,
  onAddSubTask,
  onToggleSubTask,
  onRemoveSubTask,
  canCaptureObsidian,
  canCaptureNotion,
  onSetStatus,
  onDelete,
  onReplyDraft,
  onCompleteExternal,
  onCapture,
  onDismiss,
  rawContentOpen,
  onToggleRawContent,
  rawText,
}: Props) {
  // 새 하위작업 입력값은 이 카드 밖에서 쓰이지 않는다 — 지역 state로 둔다
  const [newSubTask, setNewSubTask] = useState("");

  const isLocal = item.source === "manual" || item.source === "paste";
  const isMail = item.source === "outlook" || item.source === "gmail";
  const doneCount = subTasks.filter((s) => s.completed).length;

  const submitSubTask = () => {
    const title = newSubTask.trim();
    if (!title) return;
    onAddSubTask(title);
    setNewSubTask("");
  };

  return (
    <div
      className={[
        styles.item,
        item.pinned ? styles.itemPinned : "",
        item.overdue > 0 ? styles.itemOverdue : "",
        item.status === "completed" ? styles.itemDone : "",
      ].join(" ")}
    >
      <div className={styles.itemHeader}>
        {item.pinned && (
          <span className={styles.pinIcon} aria-label="상단 고정됨">고정</span>
        )}
        <span className={`${styles.badge} ${styles[`badge_${item.source}`]}`}>
          {SOURCE_LABELS[item.source]}
        </span>
        {item.category && (
          <span className={`${styles.cat} ${styles[`cat_${item.category}`] ?? ""}`}>
            {CATEGORY_LABELS[item.category]}
          </span>
        )}
        {item.delegatable && (
          <span
            className={styles.delegatableBadge}
            title="Claude Code 등 로컬 LLM 도구로 초안/분석을 작성하기에 적합한 업무입니다"
          >
            AI 위임 가능
          </span>
        )}
        {item.overdue > 0 && (
          <span className={styles.overdueBadge}>{item.overdue}시간째 대기</span>
        )}
        {item.status === "held" && <span className={styles.cat}>보류 중</span>}
      </div>

      <div className={styles.itemTitle}>{item.title}</div>

      {item.content && item.content !== item.title && (
        <div
          className={`${styles.itemContent} ${contentExpanded ? styles.itemContentOpen : ""}`}
          onClick={onToggleContent}
          title="눌러서 펼치기/접기"
        >
          {item.content}
        </div>
      )}

      {item.actionDirective && item.status !== "completed" && (
        <div className={styles.directive}>→ {item.actionDirective}</div>
      )}

      <div className={styles.itemMeta}>
        <span>{item.author.name}</span>
        <span>{timeAgo(item.created_at)}</span>
      </div>

      <div className={styles.itemActions}>
        {isLocal && item.status !== "completed" && (
          <>
            <button className={styles.actionBtn} onClick={() => onSetStatus("completed")}>
              완료
            </button>
            <button
              className={styles.actionBtn}
              onClick={() => onSetStatus(item.status === "held" ? "pending" : "held")}
            >
              {item.status === "held" ? "재개" : "보류"}
            </button>
          </>
        )}
        {isLocal && (
          <button className={styles.actionBtn} onClick={onDelete} aria-label={`'${item.title}' 삭제`}>
            삭제
          </button>
        )}
        {isMail && (
          <button className={styles.actionBtn} disabled={busy} onClick={onReplyDraft}>
            답장 초안
          </button>
        )}
        {(item.source === "notion" || item.source === "obsidian") && (
          <button className={styles.actionBtn} disabled={busy} onClick={onCompleteExternal}>
            완료 처리
          </button>
        )}
        {isLocal && canCaptureObsidian && (
          <button className={styles.actionBtn} disabled={busy} onClick={() => onCapture("obsidian")}>
            Obsidian
          </button>
        )}
        {isLocal && canCaptureNotion && (
          <button className={styles.actionBtn} disabled={busy} onClick={() => onCapture("notion")}>
            Notion
          </button>
        )}
        {item.url && (
          <a className={styles.actionBtn} href={item.url} target="_blank" rel="noreferrer">
            원문
          </a>
        )}
        {!isLocal && (
          <button
            className={`${styles.actionBtn} ${styles.btnDanger}`}
            onClick={onDismiss}
            aria-label={`'${item.title}' 숨기기`}
          >
            ✕
          </button>
        )}
      </div>

      {/* 입력 원문 전체 보기 버튼 & Google Drive 일자별 저장 링크 */}
      {(item.rawContent || item.driveUrl) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          {item.rawContent && (
            <button
              type="button"
              className={`${styles.workNoteToggleBtn} ${rawContentOpen ? styles.workNoteToggleBtnActive : ""}`}
              onClick={onToggleRawContent}
            >
              <span>입력 원문 전체 보기</span>
            </button>
          )}
          {item.driveUrl && (
            <a
              href={item.driveUrl}
              target="_blank"
              rel="noreferrer"
              className={styles.driveLinkBtn}
              title="Google Drive CoffeeTide 일자별 폴더에 저장된 마크다운 파일 열기"
            >
              Google Drive 원문 파일
            </a>
          )}
        </div>
      )}

      {/* 원문 펼침 상자 */}
      {rawContentOpen && (
        <div className={styles.rawContentPanel}>
          <div className={styles.rawContentHeader}>
            <span>붙여넣었던 회의록·메모 원문 전체</span>
            {item.driveUrl && (
              <a href={item.driveUrl} target="_blank" rel="noreferrer" className={styles.driveLinkBtn}>
                Google Drive에서 보기 ↗
              </a>
            )}
          </div>
          <div>{rawText || item.rawContent || "원문 데이터를 불러오는 중입니다..."}</div>
        </div>
      )}

      {/* 워크노트 & 세부 하위작업 토글 버튼 */}
      <button
        type="button"
        className={`${styles.workNoteToggleBtn} ${workNoteOpen ? styles.workNoteToggleBtnActive : ""}`}
        onClick={onToggleWorkNote}
      >
        <span>워크노트 &amp; 세부작업</span>
        {workNote && <span style={{ color: "var(--accent)", fontWeight: 700 }}>• 메모보관중</span>}
        {subTasks.length > 0 && (
          <span style={{ fontSize: "0.68rem" }}>
            ({doneCount}/{subTasks.length})
          </span>
        )}
      </button>

      {/* 워크노트 및 세부 하위작업 패널 */}
      {workNoteOpen && (
        <div className={styles.workNotePanel}>
          <div className={styles.workNoteHeader}>
            <span>업무 진행 상황 메모</span>
          </div>
          <textarea
            className={styles.workNoteTextarea}
            placeholder="진행 중인 상황이나 메모를 자유롭게 작성하세요 (예: 1차 초안 제출 완료, 팀장 피드백 대기 중)"
            value={workNote}
            onChange={(e) => onChangeWorkNote(e.target.value)}
          />

          <div className={styles.subTaskSection}>
            <div className={styles.subTaskHeader}>
              <span>세부 하위 작업</span>
              {subTasks.length > 0 && (
                <span>
                  {doneCount} / {subTasks.length} 완료
                </span>
              )}
            </div>

            {subTasks.map((sub) => (
              <div key={sub.id} className={styles.subTaskItem}>
                <input
                  type="checkbox"
                  checked={sub.completed}
                  onChange={() => onToggleSubTask(sub.id)}
                  aria-label={`'${sub.title}' 완료 표시`}
                />
                <span className={sub.completed ? styles.subTaskTitleCompleted : ""}>{sub.title}</span>
                <button
                  type="button"
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "none",
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    fontSize: "0.72rem",
                  }}
                  onClick={() => onRemoveSubTask(sub.id)}
                  title="하위 작업 삭제"
                  aria-label={`'${sub.title}' 하위 작업 삭제`}
                >
                  ✕
                </button>
              </div>
            ))}

            <div className={styles.subTaskInputRow}>
              <input
                className={styles.subTaskInput}
                placeholder="새 하위 작업 추가 (예: 자료 조사, 초안 검토)"
                value={newSubTask}
                onChange={(e) => setNewSubTask(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitSubTask()}
                aria-label="새 하위 작업"
              />
              <button
                type="button"
                className={styles.btn}
                style={{ padding: "3px 8px", fontSize: "0.72rem" }}
                onClick={submitSubTask}
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
