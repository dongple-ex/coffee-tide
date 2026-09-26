"use client";

import React, { useState, useMemo } from "react";
import {
  generateDailyReflectionReport,
  ReflectionReportTask,
} from "@/lib/companion/reflectionReportGenerator";
import { addAffectionExp } from "@/lib/ai/affectionManager";
import { createCompanionDomainEvent } from "@/lib/companion/eventLedger";
import { saveLocalCompanionEvent } from "@/lib/companion/repositories/indexedDb";
import styles from "./DailyReflectionReportModal.module.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  personaId?: string;
  baristaName?: string;
  completedTasks: ReflectionReportTask[];
  pendingTasks: ReflectionReportTask[];
  onSaveHandoff?: () => void;
  onToast?: (msg: string) => void;
}

export function DailyReflectionReportModal({
  isOpen,
  onClose,
  personaId = "karina",
  baristaName = "카리나",
  completedTasks,
  pendingTasks,
  onSaveHandoff,
  onToast,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const report = useMemo(() => {
    return generateDailyReflectionReport({
      personaId,
      baristaName,
      completedTasks,
      pendingTasks,
    });
  }, [personaId, baristaName, completedTasks, pendingTasks]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report.markdownContent);
      setCopied(true);
      onToast?.("📋 리포트 마크다운이 클립보드에 복사되었습니다.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      onToast?.("클립보드 접근에 실패했습니다. 화면의 텍스트를 직접 복사해 주세요.");
    }
  };

  const handleSaveAndComplete = async () => {
    setSaving(true);
    try {
      // 1. 클립보드 복사
      await navigator.clipboard.writeText(report.markdownContent).catch(() => {});

      // 2. 일일 회고 로컬 스토리지 보존
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("ct_daily_reflection_last", JSON.stringify(report));
        } catch {
          // ignore storage full
        }
      }

      // 3. 기존 핸드오프 상태 콜백 수행 (UI 스냅샷 보존)
      if (onSaveHandoff) {
        onSaveHandoff();
      }

      // 4. 컴패니언 도메인 이벤트 발행 (daily_reflection_saved -> +8 EXP)
      const domainEvent = createCompanionDomainEvent({
        userId: "guest",
        personaId,
        eventType: "daily_reflection_saved",
        authority: "local_provisional",
        sourceItemId: `reflection_${Date.now()}`,
        payload: {
          completionRate: report.completionRate,
          completedCount: report.completedCount,
          pendingCount: report.pendingCount,
        },
      });

      // IndexedDB 원장 저장
      void saveLocalCompanionEvent(domainEvent);

      // 호감도 및 UI 갱신 이벤트 발행
      addAffectionExp(personaId, "view_briefing");

      onToast?.(
        `👑 정시 퇴근 리포트가 저장되고 일일 회고 완료 (+8 EXP)! 오늘 하루도 고생 많으셨습니다! 🎉`
      );

      onClose();
    } catch {
      onToast?.("회고 저장 처리 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        {/* 모달 헤더 */}
        <div className={styles.modalHeader}>
          <div className={styles.titleArea}>
            <div className={styles.perkBadge}>
              👑 Lv.5 소울메이트 전용 특전
            </div>
            <h2 className={styles.modalTitle}>
              원클릭 일일 회고 & 정시 퇴근 리포트
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 요약 통계 바 */}
        <div className={styles.statsBar}>
          <div className={styles.statItem}>
            <div className={styles.statLabel}>완료한 업무</div>
            <div className={styles.statValue}>{report.completedCount}건</div>
          </div>
          <div className={styles.statItem}>
            <div className={styles.statLabel}>인수인계(잔여)</div>
            <div className={styles.statValue}>{report.pendingCount}건</div>
          </div>
          <div className={styles.statItem}>
            <div className={styles.statLabel}>오늘 달성률</div>
            <div className={styles.statValue}>{report.completionRate}%</div>
          </div>
        </div>

        {/* 바리스타 소울메이트 한마디 */}
        <div className={styles.quoteBox}>
          <div className={styles.quoteHeader}>
            <span>☕</span>
            <span>{baristaName}의 정시 퇴근 축하 멘트</span>
          </div>
          <div className={styles.quoteText}>
            {report.personaQuote}
          </div>
        </div>

        {/* 리포트 마크다운 프리뷰 */}
        <div className={styles.reportViewer}>
          {report.markdownContent}
        </div>

        {/* 액션 버튼 */}
        <div className={styles.actionsRow}>
          <button
            type="button"
            onClick={handleCopy}
            className={styles.copyButton}
          >
            <span>{copied ? "✓" : "📋"}</span>
            <span>{copied ? "복사됨!" : "클립보드 복사"}</span>
          </button>
          <button
            type="button"
            onClick={handleSaveAndComplete}
            disabled={saving}
            className={styles.saveButton}
          >
            <span>👑</span>
            <span>{saving ? "저장 중..." : "회고 저장 & 정시 퇴근 완료 (+8 EXP)"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
