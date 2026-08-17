"use client";

import React, { useState } from "react";
import styles from "./ExpenseWorkspace.module.css";
import type { ExpenseAnalysisResponse } from "@/lib/expenses/analysis";
import { ExpenseCategoryChart, ExpenseMonthlyChart } from "./ExpenseChart";

interface ExpenseDashboardProps {
  analysis?: ExpenseAnalysisResponse;
  loading?: boolean;
}

export const ExpenseDashboard: React.FC<ExpenseDashboardProps> = ({ analysis, loading }) => {
  const [activeTab, setActiveTab] = useState<"monthly" | "category">("monthly");

  if (loading && !analysis) {
    return (
      <div className={styles.dashboardSection}>
        <div style={{ color: "var(--text-dim)", fontSize: "0.875rem" }}>요약 분석 데이터를 불러오는 중...</div>
      </div>
    );
  }

  if (!analysis || analysis.totals.length === 0) {
    return (
      <div className={styles.dashboardSection}>
        <div className={styles.emptyState}>
          <span>등록된 비용 내역이 없습니다.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboardSection}>
      {/* 통화별 총액 카드 */}
      <div className={styles.totalsGrid}>
        {analysis.totals.map((total) => {
          const numAmount = Number(total.totalAmount) || 0;
          return (
            <div key={total.currency} className={styles.totalCard}>
              <div className={styles.totalCardLabel}>{total.currency} 총 지출</div>
              <div className={styles.totalCardAmount}>
                {numAmount.toLocaleString()} <span style={{ fontSize: "0.875rem" }}>{total.currency}</span>
              </div>
              <div className={styles.totalCardCount}>
                총 {total.count}건 (건당 평균 {Number(total.averageAmount || 0).toLocaleString()} {total.currency})
              </div>
            </div>
          );
        })}
      </div>

      {/* 탭 전환 */}
      <div className={styles.tabGroup}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "monthly" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("monthly")}
        >
          월별 추이
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "category" ? styles.tabButtonActive : ""}`}
          onClick={() => setActiveTab("category")}
        >
          분류별 지출
        </button>
      </div>

      {/* 차트 영역 (통화별 분리) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {analysis.totals.map((t) => {
          const currency = t.currency;
          if (activeTab === "monthly") {
            const monthlyData = analysis.monthly.filter((m) => m.currency === currency);
            return <ExpenseMonthlyChart key={currency} data={monthlyData} currency={currency} />;
          } else {
            const categoryData = analysis.byCategory.filter((c) => c.currency === currency);
            return <ExpenseCategoryChart key={currency} data={categoryData} currency={currency} />;
          }
        })}
      </div>
    </div>
  );
};
