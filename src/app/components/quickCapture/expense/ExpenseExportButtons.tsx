"use client";

import React, { useState } from "react";
import styles from "./ExpenseWorkspace.module.css";
import type { ExpenseFilters } from "./expenseTypes";
import { UiIcon } from "../../UiIcon";

interface ExpenseExportButtonsProps {
  filters: ExpenseFilters;
  disabled?: boolean;
}

interface SheetsPreviewData {
  googleEmail: string;
  rowCount: number;
  sheetNames: string[];
  chartCount: number;
  rangeText: string;
  filterText: string;
}

export const ExpenseExportButtons: React.FC<ExpenseExportButtonsProps> = ({ filters, disabled }) => {
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<SheetsPreviewData | null>(null);
  const [exportingSheets, setExportingSheets] = useState(false);
  const [sheetsResultUrl, setSheetsResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. CSV 다운로드
  const handleDownloadCsv = async () => {
    if (downloadingCsv || disabled) return;
    setDownloadingCsv(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({ format: "csv" });
      if (filters.from) queryParams.set("from", filters.from);
      if (filters.to) queryParams.set("to", filters.to);
      if (filters.category && filters.category !== "전체") queryParams.set("category", filters.category);
      if (filters.currency && filters.currency !== "전체") queryParams.set("currency", filters.currency);

      const res = await fetch(`/api/expenses/export?${queryParams.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "CSV 다운로드에 실패했습니다.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `coffeetide-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "CSV 다운로드 실패");
    } finally {
      setDownloadingCsv(false);
    }
  };

  // 2. Google Sheets 미리보기 요청
  const handleOpenSheetsPreview = async () => {
    if (previewLoading || disabled) return;
    setPreviewLoading(true);
    setError(null);
    setSheetsResultUrl(null);

    try {
      const res = await fetch("/api/expenses/export/google-sheets/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: filters.from,
          to: filters.to,
          category: filters.category,
          currency: filters.currency,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Google Sheets 내보내기 준비에 실패했습니다.");
      }

      const data: SheetsPreviewData = await res.json();
      setPreviewData(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "미리보기 요청 실패");
    } finally {
      setPreviewLoading(false);
    }
  };

  // 3. Google Sheets 실제 생성 실행
  const handleConfirmSheetsExport = async () => {
    if (exportingSheets) return;
    setExportingSheets(true);
    setError(null);

    try {
      const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `sheets-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const res = await fetch("/api/expenses/export/google-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: filters.from,
          to: filters.to,
          category: filters.category,
          currency: filters.currency,
          idempotencyKey,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Google Sheets 생성에 실패했습니다.");
      }

      const data = await res.json();
      setSheetsResultUrl(data.spreadsheetUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google Sheets 생성 실패");
    } finally {
      setExportingSheets(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div className={styles.exportButtons}>
        <button
          type="button"
          onClick={handleDownloadCsv}
          disabled={disabled || downloadingCsv}
          className={styles.secondaryButton}
          aria-label="CSV 다운로드"
          title="현재 필터 기준으로 CSV 파일 다운로드"
        >
          <UiIcon name="download" size={16} />
          <span>{downloadingCsv ? "생성 중..." : "CSV"}</span>
        </button>

        <button
          type="button"
          onClick={handleOpenSheetsPreview}
          disabled={disabled || previewLoading}
          className={styles.secondaryButton}
          aria-label="Google Sheets로 내보내기"
          title="현재 필터 기준으로 Google Sheets 생성 및 차트 연동"
        >
          <UiIcon name="external-link" size={16} />
          <span>{previewLoading ? "준비 중..." : "Google Sheets"}</span>
        </button>
      </div>

      {error && <div style={{ color: "var(--danger, #ef4444)", fontSize: "0.75rem" }}>{error}</div>}

      {/* Google Sheets 미리보기 & 확인 모달 */}
      {previewData && (
        <div className={styles.modalBackdrop} onClick={() => setPreviewData(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Google Sheets 내보내기</h3>
              <button type="button" onClick={() => setPreviewData(null)} className={styles.iconButton} aria-label="닫기">
                ✕
              </button>
            </div>

            {!sheetsResultUrl ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "0.875rem" }}>
                  <div>
                    <strong>연동 계정:</strong> {previewData.googleEmail}
                  </div>
                  <div>
                    <strong>내보낼 건수:</strong> {previewData.rowCount}건
                  </div>
                  <div>
                    <strong>기간 및 필터:</strong> {previewData.rangeText} ({previewData.filterText})
                  </div>
                  <div>
                    <strong>생성될 시트 (4개):</strong> {previewData.sheetNames.join(", ")}
                  </div>
                  <div>
                    <strong>생성될 차트:</strong> 통화별 월간 추이 및 분류별 지출 ({previewData.chartCount}개 차트)
                  </div>
                </div>

                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", lineHeight: 1.4 }}>
                  * Google Sheets API를 통해 새 스프레드시트를 생성하고 대시보드 요약표와 차트를 자동으로 구성합니다.
                </div>

                {error && <div style={{ color: "var(--danger, #ef4444)", fontSize: "0.8125rem" }}>{error}</div>}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => setPreviewData(null)}
                    disabled={exportingSheets}
                    className={styles.secondaryButton}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSheetsExport}
                    disabled={exportingSheets || previewData.rowCount === 0}
                    className={styles.primaryButton}
                  >
                    {exportingSheets ? "시트 및 차트 생성 중..." : "확인 및 생성"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, textAlign: "center", padding: "1rem 0" }}>
                <div style={{ fontSize: "1.125rem", fontWeight: 700 }}>Google Sheets 생성이 완료되었습니다!</div>
                <div style={{ fontSize: "0.875rem", color: "var(--text-dim)" }}>
                  4개의 분석 시트와 차트가 Google Drive에 안전하게 저장되었습니다.
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }}>
                  <a
                    href={sheetsResultUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.primaryButton}
                    style={{ textDecoration: "none" }}
                  >
                    Google Sheets에서 열기 ↗
                  </a>
                  <button type="button" onClick={() => setPreviewData(null)} className={styles.secondaryButton}>
                    닫기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
