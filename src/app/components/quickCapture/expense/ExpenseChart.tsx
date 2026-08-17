"use client";

import React from "react";
import styles from "./ExpenseWorkspace.module.css";
import type { ExpenseCategoryRow, ExpenseMonthlyRow } from "@/lib/expenses/analysis";

interface ExpenseMonthlyChartProps {
  data: ExpenseMonthlyRow[];
  currency: string;
}

export const ExpenseMonthlyChart: React.FC<ExpenseMonthlyChartProps> = ({ data, currency }) => {
  if (data.length === 0) {
    return <div className={styles.emptyState}>월별 지출 내역이 없습니다.</div>;
  }

  const maxAmount = Math.max(...data.map((d) => Number(d.totalAmount) || 0), 1);

  return (
    <div className={styles.chartBlock} role="region" aria-label={`[${currency}] 월별 지출 추이 차트`}>
      <div className={styles.chartBlockHeader}>
        <span>월별 지출 추이 ({currency})</span>
      </div>
      <div className={styles.chartContainer}>
        {data.map((item) => {
          const numAmount = Number(item.totalAmount) || 0;
          const percentage = Math.min(Math.round((numAmount / maxAmount) * 100), 100);
          return (
            <div
              key={item.month}
              className={styles.chartBarRow}
              aria-label={`${item.month} 지출: ${numAmount.toLocaleString()} ${currency} (${item.count}건)`}
            >
              <div className={styles.chartBarLabel}>{item.month}</div>
              <div className={styles.chartBarTrack}>
                <div className={styles.chartBarFill} style={{ width: `${percentage}%` }} />
              </div>
              <div className={styles.chartBarValue}>
                {numAmount.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface ExpenseCategoryChartProps {
  data: ExpenseCategoryRow[];
  currency: string;
}

export const ExpenseCategoryChart: React.FC<ExpenseCategoryChartProps> = ({ data, currency }) => {
  if (data.length === 0) {
    return <div className={styles.emptyState}>분류별 지출 내역이 없습니다.</div>;
  }

  // 상위 8개 및 나머지 기타 합산
  const top8 = data.slice(0, 8);
  const rest = data.slice(8);
  const chartItems: Array<{ category: string; amount: number; count: number }> = [
    ...top8.map((d) => ({
      category: d.category,
      amount: Number(d.totalAmount) || 0,
      count: d.count,
    })),
  ];

  if (rest.length > 0) {
    const restAmount = rest.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
    const restCount = rest.reduce((sum, r) => sum + r.count, 0);
    chartItems.push({ category: "기타", amount: restAmount, count: restCount });
  }

  const maxAmount = Math.max(...chartItems.map((d) => d.amount), 1);

  return (
    <div className={styles.chartBlock} role="region" aria-label={`[${currency}] 분류별 지출 비중 차트`}>
      <div className={styles.chartBlockHeader}>
        <span>분류별 지출 ({currency})</span>
      </div>
      <div className={styles.chartContainer}>
        {chartItems.map((item) => {
          const percentage = Math.min(Math.round((item.amount / maxAmount) * 100), 100);
          return (
            <div
              key={item.category}
              className={styles.chartBarRow}
              aria-label={`${item.category} 지출: ${item.amount.toLocaleString()} ${currency} (${item.count}건)`}
            >
              <div className={styles.chartBarLabel} title={item.category}>
                {item.category}
              </div>
              <div className={styles.chartBarTrack}>
                <div className={styles.chartBarFill} style={{ width: `${percentage}%` }} />
              </div>
              <div className={styles.chartBarValue}>
                {item.amount.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
