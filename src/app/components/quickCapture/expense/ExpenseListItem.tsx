"use client";

import React, { useState } from "react";
import styles from "./ExpenseWorkspace.module.css";
import type { ExpenseListRecord } from "./expenseTypes";
import type { UpdateExpenseInput } from "@/lib/expenses/service";
import type { ContentAsset } from "@/lib/data/contracts";
import { ExpenseEditSheet } from "./ExpenseEditSheet";
import { ReceiptGallery } from "./ReceiptGallery";
import { UiIcon } from "../../UiIcon";

interface ExpenseListItemProps {
  record: ExpenseListRecord;
  onUpdate: (id: string, patch: UpdateExpenseInput) => Promise<void>;
  onDelete: (id: string, expectedVersion?: number) => Promise<void>;
  onAddReceipt: (itemId: string, file: File) => Promise<ContentAsset>;
  onDeleteReceipt: (assetId: string) => Promise<void>;
  isMutating?: boolean;
}

export const ExpenseListItem: React.FC<ExpenseListItemProps> = ({
  record,
  onUpdate,
  onDelete,
  onAddReceipt,
  onDeleteReceipt,
  isMutating,
}) => {
  const { item, entry, receipts } = record;
  const [isEditing, setIsEditing] = useState(false);
  const [showReceipts, setShowReceipts] = useState(false);

  const numAmount = Number(entry.amount) || 0;
  const occurredDateStr = (entry.occurredAt || item.occurredAt || item.created_at).slice(0, 10);

  const handleDelete = async () => {
    if (
      !window.confirm(
        "이 비용을 목록과 분석에서 제외할까요? 첨부된 영수증도 더 이상 표시되지 않습니다."
      )
    ) {
      return;
    }
    await onDelete(item.id, item.version);
  };

  return (
    <div className={styles.listItem} role="article">
      <div className={styles.listItemHeader}>
        <div>
          <div className={styles.listItemTitle}>{item.title || entry.merchant || "비용"}</div>
          <div className={styles.listItemMeta} style={{ marginTop: 4 }}>
            <span>{occurredDateStr}</span>
            {entry.merchant && <span>· {entry.merchant}</span>}
            {entry.category && <span className={styles.tag}>{entry.category}</span>}
            {entry.paymentMethod && <span className={styles.tag}>{entry.paymentMethod}</span>}
          </div>
        </div>
        <div className={styles.listItemAmount}>
          {numAmount.toLocaleString()} <span style={{ fontSize: "0.8125rem", color: "var(--text-dim)" }}>{entry.currency}</span>
        </div>
      </div>

      {/* 영수증 영역 */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            type="button"
            onClick={() => setShowReceipts((prev) => !prev)}
            className={styles.secondaryButton}
            style={{ minHeight: 36, padding: "0 8px", fontSize: "0.75rem" }}
          >
            <UiIcon name="paperclip" size={14} />
            <span>영수증 {receipts.length > 0 ? `${receipts.length}장` : "첨부하기"}</span>
          </button>
        </div>

        {showReceipts && (
          <div style={{ marginTop: 8 }}>
            <ReceiptGallery
              itemId={item.id}
              receipts={receipts}
              onAddReceipt={onAddReceipt}
              onDeleteReceipt={onDeleteReceipt}
              disabled={isMutating}
            />
          </div>
        )}
      </div>

      <div className={styles.listItemActions}>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          disabled={isMutating}
          className={styles.secondaryButton}
          style={{ minHeight: 36, padding: "0 12px", fontSize: "0.8125rem" }}
        >
          수정
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isMutating}
          className={styles.secondaryButton}
          style={{
            minHeight: 36,
            padding: "0 12px",
            fontSize: "0.8125rem",
            color: "var(--danger, #ef4444)",
            borderColor: "var(--border)",
          }}
        >
          삭제
        </button>
      </div>

      {isEditing && (
        <ExpenseEditSheet
          record={record}
          onSave={onUpdate}
          onClose={() => setIsEditing(false)}
        />
      )}
    </div>
  );
};
