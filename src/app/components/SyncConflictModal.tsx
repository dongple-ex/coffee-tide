"use client";

import React, { useState } from "react";
import type { WorkspaceItem } from "@/lib/data/contracts";
import type { SyncConflict, SyncConflictChoice } from "@/lib/sync/contracts";
import { getSyncConflictFields, type SyncConflictField } from "@/lib/sync/merge";
import styles from "./SyncConflictModal.module.css";

interface SyncConflictModalProps {
  conflict: SyncConflict | null;
  onResolve: (choice: SyncConflictChoice, conflict: SyncConflict) => Promise<void>;
  onClose: () => void;
}

const FIELD_LABELS: Record<SyncConflictField, string> = {
  title: "제목",
  content: "본문",
  status: "상태",
  category: "분류",
  actionDirective: "실행 지시",
  workNote: "메모",
  subTasks: "하위 작업",
  rawContent: "원문",
  driveUrl: "Drive 링크",
  itemType: "문서 유형",
  sourceRef: "원본 참조",
  occurredAt: "발생 시각",
  attributes: "추가 속성",
  privacyScope: "보관 범위",
  aiPolicy: "AI 처리 범위",
  deletedAt: "삭제 상태",
};

function formatFieldValue(item: WorkspaceItem, field: SyncConflictField): string {
  const value = item[field];
  if (field === "deletedAt") return value ? "삭제됨" : "보관 중";
  if (value === undefined || value === null || value === "") return "(없음)";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function VersionDetails({
  item,
  fields,
}: {
  item: WorkspaceItem;
  fields: SyncConflictField[];
}) {
  const additionalFields = fields.filter((field) =>
    field !== "title" && field !== "content" && field !== "workNote" && field !== "deletedAt"
  );
  return (
    <>
      {item.deletedAt && (
        <p className={styles.deletedNotice}>이 문서는 클라우드에서 삭제된 상태입니다.</p>
      )}
      {additionalFields.map((field) => (
        <div key={field} className={styles.fieldDiff}>
          <strong>{FIELD_LABELS[field]}</strong>
          <pre>{formatFieldValue(item, field)}</pre>
        </div>
      ))}
      {(fields.includes("content") || fields.includes("rawContent")) && (
        <details className={styles.fullDetails}>
          <summary>본문과 원문 전체 보기</summary>
          <strong>본문</strong>
          <pre>{formatFieldValue(item, "content")}</pre>
          {fields.includes("rawContent") && (
            <>
              <strong>원문</strong>
              <pre>{formatFieldValue(item, "rawContent")}</pre>
            </>
          )}
        </details>
      )}
    </>
  );
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  conflict,
  onResolve,
  onClose,
}) => {
  const [resolvingChoice, setResolvingChoice] = useState<SyncConflictChoice | null>(null);
  const [resolveError, setResolveError] = useState<string>();

  if (!conflict) return null;

  const { localItem, serverItem } = conflict;
  const conflictFields = getSyncConflictFields(localItem, serverItem);
  const resolve = async (choice: SyncConflictChoice) => {
    if (resolvingChoice) return;
    setResolvingChoice(choice);
    setResolveError(undefined);
    try {
      await onResolve(choice, conflict);
      setResolvingChoice(null);
    } catch (error) {
      setResolveError(error instanceof Error ? error.message : "충돌 해결 내용을 저장하지 못했습니다.");
      setResolvingChoice(null);
    }
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
      aria-busy={Boolean(resolvingChoice)}
    >
      <div className={styles.modal}>
        <button
          type="button"
          onClick={onClose}
          disabled={Boolean(resolvingChoice)}
          className={styles.closeButton}
          aria-label="닫기"
        >
          ✕
        </button>
        <div className={styles.header}>
          <div className={styles.alertIcon}>
            !
          </div>
          <div>
            <h2 id="conflict-title" className={styles.title}>
              동기화 충돌 발생
            </h2>
            <p className={styles.description}>
              이 기기와 클라우드에서 동시에 수정되어 충돌이 발생했습니다. 보관할 버전을 선택해 주세요.
            </p>
          </div>
        </div>

        <div className={styles.diffSummary} aria-label="서로 다른 항목">
          <strong>서로 다른 항목</strong>
          <div>
            {conflictFields.length > 0
              ? conflictFields.map((field) => <span key={field}>{FIELD_LABELS[field]}</span>)
              : <span>버전</span>}
          </div>
        </div>

        {/* 비교 카드 */}
        <div className={styles.comparisonGrid}>
          {/* 이 기기 버전 */}
          <div className={styles.versionCard}>
            <div className={styles.versionHeader}>
              <span className={`${styles.versionBadge} ${styles.localBadge}`}>
                이 기기 (로컬 v{localItem.version})
              </span>
              <span className={styles.time}>
                {localItem.updatedAt ? new Date(localItem.updatedAt).toLocaleTimeString() : ""}
              </span>
            </div>
            <h3 className={styles.itemTitle}>{localItem.title}</h3>
            <p className={styles.itemContent}>
              {localItem.content || "(내용 없음)"}
            </p>
            {(localItem.workNote || conflictFields.includes("workNote")) && (
              <div className={styles.note}>
                메모: {formatFieldValue(localItem, "workNote")}
              </div>
            )}
            <VersionDetails item={localItem} fields={conflictFields} />
          </div>

          {/* 클라우드 버전 */}
          <div className={styles.versionCard}>
            <div className={styles.versionHeader}>
              <span className={`${styles.versionBadge} ${styles.serverBadge}`}>
                클라우드 (서버 v{serverItem.version})
              </span>
              <span className={styles.time}>
                {serverItem.updatedAt ? new Date(serverItem.updatedAt).toLocaleTimeString() : ""}
              </span>
            </div>
            <h3 className={styles.itemTitle}>{serverItem.title}</h3>
            <p className={styles.itemContent}>
              {serverItem.content || "(내용 없음)"}
            </p>
            {(serverItem.workNote || conflictFields.includes("workNote")) && (
              <div className={styles.note}>
                메모: {formatFieldValue(serverItem, "workNote")}
              </div>
            )}
            <VersionDetails item={serverItem} fields={conflictFields} />
          </div>
        </div>

        {resolveError && <p className={styles.resolveError} role="alert">{resolveError}</p>}

        {/* 액션 버튼 */}
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => void resolve("keep_local")}
            disabled={Boolean(resolvingChoice)}
            className={`${styles.actionButton} ${styles.localAction}`}
          >
            {resolvingChoice === "keep_local"
              ? "이 기기 버전 저장 중…"
              : serverItem.deletedAt ? "이 기기 문서 복원" : "이 기기 버전 유지"}
          </button>
          <button
            type="button"
            onClick={() => void resolve("keep_server")}
            disabled={Boolean(resolvingChoice)}
            className={`${styles.actionButton} ${styles.serverAction}`}
          >
            {resolvingChoice === "keep_server"
              ? "클라우드 버전 적용 중…"
              : serverItem.deletedAt ? "클라우드 삭제 상태 적용" : "클라우드 버전 유지"}
          </button>
          <button
            type="button"
            onClick={() => void resolve("keep_both")}
            disabled={Boolean(resolvingChoice)}
            className={styles.actionButton}
          >
            {resolvingChoice === "keep_both"
              ? "사본 생성 중…"
              : serverItem.deletedAt ? "이 기기 내용을 사본으로 보관" : "둘 다 보관 (사본 생성)"}
          </button>
        </div>
      </div>
    </div>
  );
};
