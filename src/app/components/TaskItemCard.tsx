"use client";

import React, { useState } from "react";
import { ProcessedData } from "@/lib/automation/rules";
import { timeAgo } from "@/lib/mergeView";
import { CATEGORY_LABELS, SOURCE_LABELS, SubTask, UnifiedData } from "@/lib/types/unified";
import { SourceAndRelationsPanel } from "./item/SourceAndRelationsPanel";
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
  onCapture,
  onDismiss,
  rawText,
}: Props) {
  const [newSubTask, setNewSubTask] = useState("");

  const submitSubTask = () => {
    const trimmed = newSubTask.trim();
    if (!trimmed) return;
    onAddSubTask(trimmed);
    setNewSubTask("");
  };

  const isExternal =
    item.source === "outlook" ||
    item.source === "gmail" ||
    item.source === "notion" ||
    item.source === "obsidian";

  const isCompleted = item.status === "completed";
  const isHeld = item.status === "held";
  const isUrgent = item.category === "urgent";

  return (
    <div
      className={`${styles.taskItem} ${isCompleted ? styles.taskItemDone : ""} ${
        isHeld ? styles.taskItemHeld : ""
      } ${isUrgent ? styles.taskItemUrgent : ""}`}
    >
      <div className={styles.taskHeader}>
        <div className={styles.taskMeta}>
          <span className={`${styles.badge} ${styles[`badge_${item.source}`] || ""}`}>
            {SOURCE_LABELS[item.source] || item.source}
          </span>
          {item.category && (
            <span className={`${styles.badge} ${styles[`badge_${item.category}`] || ""}`}>
              {CATEGORY_LABELS[item.category] || item.category}
            </span>
          )}
          <span className={styles.taskAuthor}>{item.author.name}</span>
          <span className={styles.taskTime}>{timeAgo(item.created_at)}</span>
        </div>

        <div className={styles.taskActions}>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.taskLink}
              title="원문 열기"
            >
              🔗
            </a>
          )}
          <button
            type="button"
            className={styles.btnIcon}
            onClick={onToggleWorkNote}
            title="진행 메모 / 하위 작업"
            aria-expanded={workNoteOpen}
          >
            📝
          </button>
          {isExternal && (
            <button
              type="button"
              className={styles.btnIcon}
              onClick={onDismiss}
              title="목록에서 숨기기"
            >
              ✕
            </button>
          )}
          {!isExternal && (
            <button
              type="button"
              className={styles.btnIcon}
              onClick={onDelete}
              title="삭제"
            >
              🗑
            </button>
          )}
        </div>
      </div>

      <div className={styles.taskBody}>
        <h4 className={styles.taskTitle}>
          {item.pinned && <span className={styles.pinIcon}>📌 </span>}
          {item.title}
        </h4>

        {item.content && item.content !== item.title && (
          <p
            className={`${styles.taskContent} ${
              contentExpanded ? styles.taskContentExpanded : styles.taskContentClamped
            }`}
            onClick={onToggleContent}
          >
            {item.content}
          </p>
        )}

        {item.actionDirective && (
          <div className={styles.actionDirective}>
            💡 <strong>행동 지침:</strong> {item.actionDirective}
          </div>
        )}
      </div>

      {/* 상태 조작 버튼 */}
      <div className={styles.taskFooter}>
        <div className={styles.taskStatusButtons}>
          <button
            type="button"
            className={`${styles.btnStatus} ${isCompleted ? styles.btnStatusActive : ""}`}
            onClick={() => onSetStatus(isCompleted ? "pending" : "completed")}
            disabled={busy}
          >
            {isCompleted ? "✓ 완료됨" : "✅ 완료"}
          </button>
          <button
            type="button"
            className={`${styles.btnStatus} ${isHeld ? styles.btnStatusActive : ""}`}
            onClick={() => onSetStatus(isHeld ? "pending" : "held")}
            disabled={busy}
          >
            {isHeld ? "▶️ 재개" : "⏸ 보류"}
          </button>
        </div>

        <div className={styles.taskSecondaryActions}>
          {(item.source === "outlook" || item.source === "gmail") && (
            <button
              type="button"
              className={styles.btnAction}
              onClick={onReplyDraft}
              disabled={busy}
            >
              AI 답장 초안
            </button>
          )}
          {canCaptureObsidian && (
            <button
              type="button"
              className={styles.btnAction}
              onClick={() => onCapture("obsidian")}
              disabled={busy}
            >
              📥 Obsidian 수집
            </button>
          )}
          {canCaptureNotion && (
            <button
              type="button"
              className={styles.btnAction}
              onClick={() => onCapture("notion")}
              disabled={busy}
            >
              Notion 수집
            </button>
          )}
        </div>
      </div>

      {/* 워크노트 및 하위 작업 패널 */}
      {workNoteOpen && (
        <div className={styles.workNotePanel}>
          <div className={styles.workNoteSection}>
            <label className={styles.panelLabel}>진행 메모</label>
            <textarea
              className={styles.workNoteTextarea}
              placeholder="이 업무에 대한 메모를 작성하세요..."
              value={workNote}
              onChange={(e) => onChangeWorkNote(e.target.value)}
            />
          </div>

          <div className={styles.subTaskSection}>
            <label className={styles.panelLabel}>하위 작업 체크리스트</label>
            {subTasks.map((sub) => (
              <div key={sub.id} className={styles.subTaskItem}>
                <input
                  type="checkbox"
                  checked={sub.completed}
                  onChange={() => onToggleSubTask(sub.id)}
                  id={`sub-${sub.id}`}
                />
                <label
                  htmlFor={`sub-${sub.id}`}
                  className={sub.completed ? styles.subTaskDone : ""}
                >
                  {sub.title}
                </label>
                <button
                  type="button"
                  onClick={() => onRemoveSubTask(sub.id)}
                  className={styles.btnSubTaskDelete}
                >
                  ✕
                </button>
              </div>
            ))}

            <div className={styles.subTaskInputRow}>
              <input
                type="text"
                placeholder="하위 작업 추가"
                value={newSubTask}
                onChange={(e) => setNewSubTask(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitSubTask()}
                className={styles.subTaskInput}
              />
              <button
                type="button"
                onClick={submitSubTask}
                className={styles.btnSubTaskAdd}
              >
                추가
              </button>
            </div>
          </div>

          {/* 원문 및 관계 패널 연결 */}
          <SourceAndRelationsPanel
            itemId={item.id}
            rawContent={rawText || (item as unknown as { rawContent?: string }).rawContent}
            driveUrl={(item as unknown as { driveUrl?: string }).driveUrl}
          />
        </div>
      )}
    </div>
  );
}
