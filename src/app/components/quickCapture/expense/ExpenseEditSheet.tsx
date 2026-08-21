"use client";

import React, { useState } from "react";
import styles from "./ExpenseWorkspace.module.css";
import { toLocalDateTimeInput, type ExpenseListRecord } from "./expenseTypes";
import type { UpdateExpenseInput } from "@/lib/expenses/service";

interface ExpenseEditSheetProps {
  record: ExpenseListRecord;
  onSave: (id: string, patch: UpdateExpenseInput) => Promise<void>;
  onClose: () => void;
}

export const ExpenseEditSheet: React.FC<ExpenseEditSheetProps> = ({ record, onSave, onClose }) => {
  const { item, entry } = record;

  const [title, setTitle] = useState(item.title || "");
  const [amount, setAmount] = useState(entry.amount || "");
  const [currency, setCurrency] = useState(entry.currency || "KRW");
  const [category, setCategory] = useState(entry.category || "");
  const [paymentMethod, setPaymentMethod] = useState(entry.paymentMethod || "");
  const [merchant, setMerchant] = useState(entry.merchant || "");
  const [occurredAt, setOccurredAt] = useState(entry.occurredAt || item.occurredAt || item.created_at);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount.trim() || saving) return;

    setSaving(true);
    setError(null);
    try {
      await onSave(item.id, {
        title,
        amount,
        currency,
        category,
        paymentMethod,
        merchant,
        occurredAt,
        expectedVersion: item.version,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "수정 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>비용 수정</h3>
          <button type="button" onClick={onClose} className={styles.iconButton} aria-label="닫기">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>금액 *</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="예: 15000"
                className={styles.textInput}
                required
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>통화 (ISO 4217) *</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="KRW, USD"
                className={styles.textInput}
                maxLength={3}
                required
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>분류</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="식비, 교통비, 사무용품"
                className={styles.textInput}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>결제수단</label>
              <input
                type="text"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                placeholder="법인카드, 개인카드, 현금"
                className={styles.textInput}
              />
            </div>

            <div className={styles.formFieldFull}>
              <label className={styles.formLabel}>사용처 (상호·가맹점)</label>
              <input
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="스타벅스, 택시, 식당 등"
                className={styles.textInput}
              />
            </div>

            <div className={styles.formFieldFull}>
              <label className={styles.formLabel}>사용 일시 *</label>
              <input
                type="datetime-local"
                value={toLocalDateTimeInput(occurredAt)}
                onChange={(e) => {
                  const d = new Date(e.target.value);
                  if (!Number.isNaN(d.getTime())) {
                    setOccurredAt(d.toISOString());
                  }
                }}
                className={styles.textInput}
                required
              />
            </div>

            <div className={styles.formFieldFull}>
              <label className={styles.formLabel}>제목 (요약 설명)</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="비용 요약 내용"
                className={styles.textInput}
              />
            </div>
          </div>

          {error && <div style={{ color: "var(--danger, #ef4444)", fontSize: "0.8125rem" }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={onClose} disabled={saving} className={styles.secondaryButton}>
              취소
            </button>
            <button type="submit" disabled={saving || !amount.trim()} className={styles.primaryButton}>
              {saving ? "저장 중..." : "변경 사항 저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
