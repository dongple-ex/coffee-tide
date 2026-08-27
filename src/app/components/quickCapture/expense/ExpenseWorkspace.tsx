"use client";

import React, { useMemo, useState } from "react";
import styles from "./ExpenseWorkspace.module.css";
import { useExpenses } from "./useExpenses";
import { ExpenseDashboard } from "./ExpenseDashboard";
import { ExpenseFilters } from "./ExpenseFilters";
import { ExpenseExportButtons } from "./ExpenseExportButtons";
import { ExpenseList } from "./ExpenseList";
import { ReceiptPicker } from "./ReceiptPicker";
import { UiIcon } from "../../UiIcon";
import { toLocalDateTimeInput } from "./expenseTypes";
import { generateId } from "@/lib/ids";

interface ExpenseDraftState {
  itemId: string;
  amount?: string;
  currency: string;
  category?: string;
  paymentMethod?: string;
  merchant?: string;
  occurredAt?: string;
  sourceText: string;
}

interface ExpenseWorkspaceProps {
  onSaveExpense?: (expense: {
    itemId?: string;
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
  initialText?: string;
  onInitialTextConsumed?: () => void;
  onRequestVoice?: () => void;
}

function createExpenseItemId(): string {
  return generateId("expense");
}

export const ExpenseWorkspace: React.FC<ExpenseWorkspaceProps> = ({
  onSaveExpense,
  disabled,
  isLoading: propLoading,
  initialText,
  onInitialTextConsumed,
  onRequestVoice,
}) => {
  const {
    records,
    analysis,
    loading: dataLoading,
    loadingMore,
    mutatingId,
    error: dataError,
    filters,
    setFilters,
    nextCursor,
    loadMore,
    refresh,
    updateExpense,
    deleteExpense,
    addReceipt,
    deleteReceipt,
  } = useExpenses();

  // 신규 비용 입력 상태
  const [inputText, setInputText] = useState(initialText ?? "");
  const [isParsing, setIsParsing] = useState(false);
  const [draft, setDraft] = useState<ExpenseDraftState | null>(null);
  const [pendingReceiptFile, setPendingReceiptFile] = useState<File | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "error" | "warning" | "success"; text: string } | null>(null);

  // 분류 및 통화 목록 추출
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.entry.category) set.add(r.entry.category);
    }
    return Array.from(set).sort();
  }, [records]);

  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.entry.currency) set.add(r.entry.currency.toUpperCase());
    }
    return Array.from(set).sort();
  }, [records]);

  // 자연어 분석 핸들러
  const handleParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || disabled || propLoading || isParsing) return;

    onInitialTextConsumed?.();
    setIsParsing(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/expenses/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });

      if (res.ok) {
        const data = await res.json();
        setDraft({ ...data.draft, itemId: createExpenseItemId() });
      } else {
        // 기본 폴백
        setDraft({
          itemId: createExpenseItemId(),
          amount: "",
          currency: "KRW",
          occurredAt: new Date().toISOString(),
          sourceText: inputText,
        });
      }
    } catch {
      setDraft({
        itemId: createExpenseItemId(),
        amount: "",
        currency: "KRW",
        occurredAt: new Date().toISOString(),
        sourceText: inputText,
      });
    } finally {
      setIsParsing(false);
    }
  };

  // 비용 및 영수증 등록 핸들러 (원칙 5: 부분 실패 허용)
  const handleConfirmSave = async () => {
    if (!draft || !draft.amount || !draft.occurredAt || disabled || savingExpense) return;
    setSavingExpense(true);
    setStatusMessage(null);

    const expensePayload = {
      itemId: draft.itemId,
      title: draft.sourceText || `${draft.merchant || draft.category || "비용"} ${Number(draft.amount).toLocaleString()} ${draft.currency}`,
      amount: draft.amount,
      currency: draft.currency,
      category: draft.category,
      paymentMethod: draft.paymentMethod,
      merchant: draft.merchant,
      occurredAt: draft.occurredAt,
    };

    try {
      // 1. 비용 저장 (onSaveExpense 프롭이 있으면 호출, 없으면 fetch /api/expenses)
      if (onSaveExpense) {
        await onSaveExpense(expensePayload);
      } else {
        const res = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(expensePayload),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "비용 등록에 실패했습니다.");
        }
      }

      // 2. 선택된 영수증이 있을 경우 업로드 시도 (부분 실패 허용)
      if (pendingReceiptFile) {
        try {
          await addReceipt(draft.itemId, pendingReceiptFile);
        } catch {
          setStatusMessage({
            type: "warning",
            text: "비용은 저장했지만 영수증은 올리지 못했습니다. 아래 목록에서 다시 첨부할 수 있습니다.",
          });
          setDraft(null);
          setInputText("");
          setPendingReceiptFile(null);
          await refresh();
          return;
        }
      }

      setDraft(null);
      setInputText("");
      setPendingReceiptFile(null);
      await refresh();
      setStatusMessage({ type: "success", text: "비용이 성공적으로 등록되었습니다." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "비용 저장에 실패했습니다. 로그인 상태를 확인해 주세요.";
      setStatusMessage({ type: "error", text: msg });
    } finally {
      setSavingExpense(false);
    }
  };

  // 직접 추가 핸들러 (자연어 분석 없이 즉시 입력 양식 열기)
  const handleDirectAdd = () => {
    onInitialTextConsumed?.();
    setDraft({
      itemId: createExpenseItemId(),
      amount: "",
      currency: "KRW",
      occurredAt: new Date().toISOString(),
      sourceText: inputText.trim(),
    });
    setStatusMessage(null);
  };

  return (
    <div className={styles.workspace}>
      {/* 1. 상단 빠른 입력 영역 */}
      <div className={styles.inputSection}>
        {!draft ? (
          <form onSubmit={handleParse} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                onInitialTextConsumed?.();
              }}
              placeholder="자연어로 비용을 입력하세요 (예: 오늘 점심 12,000원 법인카드)"
              disabled={disabled || propLoading || isParsing}
              className={styles.textInput}
            />
            <div className={styles.quickActionRow}>
              {onRequestVoice && (
                <button
                  type="button"
                  onClick={onRequestVoice}
                  disabled={disabled || propLoading || isParsing}
                  className={styles.iconButton}
                  title="음성으로 비용 입력하기"
                  aria-label="음성으로 비용 입력하기"
                >
                  <UiIcon name="microphone" size={20} />
                </button>
              )}
              <button
                type="button"
                onClick={handleDirectAdd}
                disabled={disabled || propLoading || isParsing}
                className={styles.secondaryButton}
                style={{ whiteSpace: "nowrap" }}
                title="양식으로 직접 추가"
              >
                <UiIcon name="plus" size={16} />
                직접 추가
              </button>
              <button
                type="submit"
                disabled={!inputText.trim() || disabled || propLoading || isParsing}
                className={styles.primaryButton}
                style={{ flex: 1 }}
              >
                {isParsing ? "분석 중..." : "분석"}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 700 }}>비용 정보 확인</span>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setPendingReceiptFile(null);
                }}
                className={styles.secondaryButton}
                style={{ minHeight: 32, padding: "0 8px", fontSize: "0.75rem" }}
              >
                다시 작성
              </button>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>금액 *</label>
                <input
                  type="text"
                  value={draft.amount || ""}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  placeholder="금액 입력"
                  className={styles.textInput}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>통화 *</label>
                <input
                  type="text"
                  value={draft.currency || "KRW"}
                  onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
                  className={styles.textInput}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>분류</label>
                <input
                  type="text"
                  value={draft.category || ""}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  placeholder="식비, 교통비 등"
                  className={styles.textInput}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>결제수단</label>
                <input
                  type="text"
                  value={draft.paymentMethod || ""}
                  onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value })}
                  placeholder="법인카드, 개인카드 등"
                  className={styles.textInput}
                />
              </div>
              <div className={styles.formFieldFull}>
                <label className={styles.formLabel}>사용처</label>
                <input
                  type="text"
                  value={draft.merchant || ""}
                  onChange={(e) => setDraft({ ...draft, merchant: e.target.value })}
                  placeholder="상호·가맹점"
                  className={styles.textInput}
                />
              </div>
              <div className={styles.formFieldFull}>
                <label className={styles.formLabel}>사용 일시 *</label>
                <input
                  type="datetime-local"
                  value={toLocalDateTimeInput(draft.occurredAt)}
                  onChange={(e) => {
                    const date = new Date(e.target.value);
                    setDraft({
                      ...draft,
                      occurredAt: Number.isNaN(date.getTime()) ? undefined : date.toISOString(),
                    });
                  }}
                  className={styles.textInput}
                />
              </div>
            </div>

            {/* 영수증 선택기 */}
            <ReceiptPicker onFileSelected={(file) => setPendingReceiptFile(file)} disabled={savingExpense} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={!draft.amount || !draft.occurredAt || disabled || savingExpense}
                className={styles.primaryButton}
                style={{ width: "100%" }}
              >
                {savingExpense ? "저장 중..." : "확인 및 비용 등록"}
              </button>
            </div>
          </div>
        )}

        {statusMessage && (
          <div
            style={{
              padding: "0.625rem 0.875rem",
              borderRadius: 8,
              fontSize: "0.8125rem",
              backgroundColor:
                statusMessage.type === "error"
                  ? "rgba(239, 68, 68, 0.1)"
                  : statusMessage.type === "warning"
                  ? "rgba(245, 158, 11, 0.1)"
                  : "rgba(16, 185, 129, 0.1)",
              color:
                statusMessage.type === "error"
                  ? "var(--danger, #ef4444)"
                  : statusMessage.type === "warning"
                  ? "var(--warning, #f59e0b)"
                  : "var(--success, #10b981)",
            }}
          >
            {statusMessage.text}
          </div>
        )}
        {dataError && (
          <div style={{ color: "var(--danger, #ef4444)", fontSize: "0.8125rem" }}>{dataError}</div>
        )}
      </div>

      {/* 2. 대시보드 및 통화별/월별/분류별 차트 */}
      <ExpenseDashboard analysis={analysis} loading={dataLoading} />

      {/* 3. 기간/분류/통화 필터 및 내보내기 버튼 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <ExpenseFilters
            filters={filters}
            onChange={setFilters}
            categories={categories}
            currencies={currencies}
          />
          <ExpenseExportButtons filters={filters} disabled={records.length === 0} />
        </div>
      </div>

      {/* 4. 비용 목록 및 수정/삭제/영수증 관리 */}
      <ExpenseList
        records={records}
        loading={dataLoading}
        loadingMore={loadingMore}
        mutatingId={mutatingId}
        hasMore={Boolean(nextCursor)}
        onLoadMore={loadMore}
        onUpdate={updateExpense}
        onDelete={deleteExpense}
        onAddReceipt={addReceipt}
        onDeleteReceipt={deleteReceipt}
      />
    </div>
  );
};
