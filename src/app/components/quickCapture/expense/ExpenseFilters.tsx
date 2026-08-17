"use client";

import React from "react";
import styles from "./ExpenseWorkspace.module.css";
import type { ExpenseFilters as FilterType } from "./expenseTypes";

interface ExpenseFiltersProps {
  filters: FilterType;
  onChange: (filters: FilterType) => void;
  categories: string[];
  currencies: string[];
}

export const ExpenseFilters: React.FC<ExpenseFiltersProps> = ({
  filters,
  onChange,
  categories,
  currencies,
}) => {
  const handleDateChange = (field: "from" | "to", val: string) => {
    onChange({
      ...filters,
      [field]: val ? new Date(val).toISOString() : undefined,
    });
  };

  const handleSelectChange = (field: "category" | "currency", val: string) => {
    onChange({
      ...filters,
      [field]: val === "전체" ? undefined : val,
    });
  };

  const fromDateStr = filters.from ? filters.from.slice(0, 10) : "";
  const toDateStr = filters.to ? filters.to.slice(0, 10) : "";

  return (
    <div className={styles.filterSection}>
      <div className={styles.filterControls}>
        <div>
          <input
            type="date"
            value={fromDateStr}
            onChange={(e) => handleDateChange("from", e.target.value)}
            className={styles.textInput}
            aria-label="시작 일자"
            title="시작 일자"
          />
        </div>
        <div>
          <input
            type="date"
            value={toDateStr}
            onChange={(e) => handleDateChange("to", e.target.value)}
            className={styles.textInput}
            aria-label="종료 일자"
            title="종료 일자"
          />
        </div>
        <div>
          <select
            value={filters.category || "전체"}
            onChange={(e) => handleSelectChange("category", e.target.value)}
            className={styles.selectInput}
            aria-label="분류 선택"
          >
            <option value="전체">분류: 전체</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div>
          <select
            value={filters.currency || "전체"}
            onChange={(e) => handleSelectChange("currency", e.target.value)}
            className={styles.selectInput}
            aria-label="통화 선택"
          >
            <option value="전체">통화: 전체</option>
            {currencies.map((cur) => (
              <option key={cur} value={cur}>
                {cur}
              </option>
            ))}
          </select>
        </div>
      </div>
      {(filters.from || filters.to || filters.category || filters.currency) && (
        <button
          type="button"
          onClick={() => onChange({})}
          className={styles.secondaryButton}
          style={{ minHeight: 44, padding: "0 12px", fontSize: "0.8125rem" }}
        >
          필터 초기화
        </button>
      )}
    </div>
  );
};
