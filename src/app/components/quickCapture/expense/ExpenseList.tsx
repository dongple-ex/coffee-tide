"use client";

import React from "react";
import styles from "./ExpenseWorkspace.module.css";
import type { ExpenseListRecord } from "./expenseTypes";
import type { UpdateExpenseInput } from "@/lib/expenses/service";
import type { ContentAsset } from "@/lib/data/contracts";
import { ExpenseListItem } from "./ExpenseListItem";

interface ExpenseListProps {
  records: ExpenseListRecord[];
  loading?: boolean;
  loadingMore?: boolean;
  mutatingId?: string;
  hasMore?: boolean;
  onLoadMore: () => void;
  onUpdate: (id: string, patch: UpdateExpenseInput) => Promise<void>;
  onDelete: (id: string, expectedVersion?: number) => Promise<void>;
  onAddReceipt: (itemId: string, file: File) => Promise<ContentAsset>;
  onDeleteReceipt: (assetId: string) => Promise<void>;
}

export const ExpenseList: React.FC<ExpenseListProps> = ({
  records,
  loading,
  loadingMore,
  mutatingId,
  hasMore,
  onLoadMore,
  onUpdate,
  onDelete,
  onAddReceipt,
  onDeleteReceipt,
}) => {
  if (loading && records.length === 0) {
    return (
      <div className={styles.listSection}>
        <div style={{ color: "var(--text-dim)", padding: "1.5rem 0", textAlign: "center" }}>
          비용 내역을 불러오는 중...
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className={styles.listSection}>
        <div className={styles.emptyState}>
          <span style={{ fontSize: "1rem", fontWeight: 600 }}>조회된 비용 내역이 없습니다.</span>
          <span style={{ fontSize: "0.8125rem" }}>상단에서 새로운 지출을 입력하거나 필터를 변경해 보세요.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.listSection}>
      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-dim)" }}>
        비용 내역 ({records.length}건)
      </div>

      {records.map((record) => (
        <ExpenseListItem
          key={record.item.id}
          record={record}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddReceipt={onAddReceipt}
          onDeleteReceipt={onDeleteReceipt}
          isMutating={mutatingId === record.item.id}
        />
      ))}

      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className={styles.secondaryButton}
            style={{ width: "100%", maxWidth: 300 }}
          >
            {loadingMore ? "불러오는 중..." : "더 보기"}
          </button>
        </div>
      )}
    </div>
  );
};
