"use client";

import React, { useCallback, useEffect, useState } from "react";
import styles from "./QuickCapture.module.css";

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

interface ExpenseCaptureProps {
  onSaveExpense: (expense: {
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

function toLocalDateTimeInput(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function createExpenseItemId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `expense-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const ExpenseCapture: React.FC<ExpenseCaptureProps> = ({
  onSaveExpense,
  disabled,
  isLoading,
  initialText,
  onInitialTextConsumed,
  onRequestVoice,
}) => {
  const [inputText, setInputText] = useState(initialText ?? "");
  const [isParsing, setIsParsing] = useState(false);
  const [draft, setDraft] = useState<ExpenseDraftState | null>(null);
  const [saveError, setSaveError] = useState("");
  const [summary, setSummary] = useState<Array<{ currency: string; totalAmount: number; count: number }>>([]);

  const refreshSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/expenses/summary");
      if (!response.ok) return;
      const data = await response.json();
      setSummary(data.summary?.totals || []);
    } catch {
      // 요약 실패가 비용 입력을 막지 않습니다.
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/expenses/summary")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (active && data) setSummary(data.summary?.totals || []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const handleParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || disabled || isLoading || isParsing) return;

    onInitialTextConsumed?.();
    setIsParsing(true);
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
        // 폴백
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

  const handleConfirmSave = async () => {
    if (!draft || !draft.amount || !draft.occurredAt || disabled || isLoading) return;
    setSaveError("");
    try {
      await onSaveExpense({
        itemId: draft.itemId,
        title: draft.sourceText,
        amount: draft.amount,
        currency: draft.currency,
        category: draft.category,
        paymentMethod: draft.paymentMethod,
        merchant: draft.merchant,
        occurredAt: draft.occurredAt,
      });
      setDraft(null);
      setInputText("");
      await refreshSummary();
    } catch {
      setSaveError("비용을 저장하지 못했습니다. 로그인과 네트워크 상태를 확인해 주세요.");
    }
  };

  return (
    <div className={styles.inputForm}>
      {!draft ? (
        <form onSubmit={handleParse} className={styles.inputRow}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              onInitialTextConsumed?.();
            }}
            placeholder="자연어로 비용을 입력하세요 (예: 오늘 점심 12,000원 법인카드)"
            disabled={disabled || isLoading || isParsing}
            className={styles.textInput}
          />
          {onRequestVoice && (
            <button
              type="button"
              onClick={onRequestVoice}
              disabled={disabled || isLoading || isParsing}
              className={styles.secondaryButton}
              title="음성으로 비용 입력하기"
              aria-label="음성으로 비용 입력하기"
            >
              🎤 음성
            </button>
          )}
          <button
            type="submit"
            disabled={!inputText.trim() || disabled || isLoading || isParsing}
            className={styles.submitButton}
          >
            {isParsing ? "분석 중..." : "분석"}
          </button>
        </form>
      ) : (
        <div className={styles.cardPreview}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span className={`${styles.badge} ${styles.badgeInfo}`}>비용 정보 확인</span>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className={styles.secondaryButton}
              style={{ minHeight: 32, padding: "2px 8px", fontSize: "0.75rem" }}
            >
              다시 작성
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: "0.72rem", color: "var(--text-muted, #a1a1aa)", display: "block", marginBottom: 2 }}>금액</label>
              <input
                type="text"
                value={draft.amount || ""}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                placeholder="금액 입력"
                className={styles.textInput}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.72rem", color: "var(--text-muted, #a1a1aa)", display: "block", marginBottom: 2 }}>통화</label>
              <input
                type="text"
                value={draft.currency || "KRW"}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                className={styles.textInput}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.72rem", color: "var(--text-muted, #a1a1aa)", display: "block", marginBottom: 2 }}>분류</label>
              <input
                type="text"
                value={draft.category || ""}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                placeholder="식비, 교통비 등"
                className={styles.textInput}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.72rem", color: "var(--text-muted, #a1a1aa)", display: "block", marginBottom: 2 }}>결제수단</label>
              <input
                type="text"
                value={draft.paymentMethod || ""}
                onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value })}
                placeholder="법인카드, 개인카드 등"
                className={styles.textInput}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.72rem", color: "var(--text-muted, #a1a1aa)", display: "block", marginBottom: 2 }}>사용처</label>
              <input
                type="text"
                value={draft.merchant || ""}
                onChange={(e) => setDraft({ ...draft, merchant: e.target.value })}
                placeholder="상호·가맹점"
                className={styles.textInput}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.72rem", color: "var(--text-muted, #a1a1aa)", display: "block", marginBottom: 2 }}>사용 일시</label>
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
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={handleConfirmSave}
              disabled={!draft.amount || !draft.occurredAt || disabled || isLoading}
              className={styles.submitButton}
              style={{ width: "100%" }}
            >
              {isLoading ? "저장 중..." : "확인 및 비용 등록"}
            </button>
          </div>
        </div>
      )}
      {saveError && <div className={styles.errorMessage}>{saveError}</div>}
      {summary.length > 0 && (
        <div className={styles.expenseSummary} aria-label="비용 요약">
          <strong>비용 요약</strong>
          {summary.map((total) => (
            <span key={total.currency}>
              {total.currency} {total.totalAmount.toLocaleString()} ({total.count}건)
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
