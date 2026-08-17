import { describe, expect, it } from "vitest";
import { calculateExpenseAnalysis } from "./analysis";
import type { ExpenseEntry } from "../data/contracts";

function createMockEntry(partial: Partial<ExpenseEntry> & { itemId: string; amount: string; currency: string; occurredAt: string }): ExpenseEntry {
  return {
    taxDeductible: false,
    reimbursable: false,
    ...partial,
  };
}

describe("calculateExpenseAnalysis", () => {
  it("U01: 월별 KRW 3건 집계가 정확해야 한다", () => {
    const entries: ExpenseEntry[] = [
      createMockEntry({ itemId: "1", amount: "10000", currency: "KRW", occurredAt: "2026-08-01T10:00:00Z" }),
      createMockEntry({ itemId: "2", amount: "20000", currency: "KRW", occurredAt: "2026-08-15T12:00:00Z" }),
      createMockEntry({ itemId: "3", amount: "30000", currency: "KRW", occurredAt: "2026-08-20T14:00:00Z" }),
    ];

    const result = calculateExpenseAnalysis(entries, { timeZone: "Asia/Seoul" });

    expect(result.totals).toHaveLength(1);
    expect(result.totals[0]).toEqual({
      currency: "KRW",
      totalAmount: "60000",
      count: 3,
      averageAmount: "20000",
    });

    expect(result.monthly).toHaveLength(1);
    expect(result.monthly[0].month).toBe("2026-08");
    expect(result.monthly[0].totalAmount).toBe("60000");
    expect(result.monthly[0].count).toBe(3);
  });

  it("U02: KRW와 USD 혼합 시 통화별 별도 행으로 생성되어야 한다 (임의 합산 금지)", () => {
    const entries: ExpenseEntry[] = [
      createMockEntry({ itemId: "1", amount: "50000", currency: "KRW", occurredAt: "2026-08-01T10:00:00Z" }),
      createMockEntry({ itemId: "2", amount: "25.50", currency: "USD", occurredAt: "2026-08-02T10:00:00Z" }),
    ];

    const result = calculateExpenseAnalysis(entries);

    expect(result.totals).toHaveLength(2);
    expect(result.totals.find((t) => t.currency === "KRW")?.totalAmount).toBe("50000");
    expect(result.totals.find((t) => t.currency === "USD")?.totalAmount).toBe("25.5");
  });

  it("U03: 분류가 없는 항목은 '미분류'로 집계되어야 한다", () => {
    const entries: ExpenseEntry[] = [
      createMockEntry({ itemId: "1", amount: "10000", currency: "KRW", occurredAt: "2026-08-01T10:00:00Z", category: "" }),
      createMockEntry({ itemId: "2", amount: "15000", currency: "KRW", occurredAt: "2026-08-02T10:00:00Z", category: undefined }),
      createMockEntry({ itemId: "3", amount: "20000", currency: "KRW", occurredAt: "2026-08-03T10:00:00Z", category: "식비" }),
    ];

    const result = calculateExpenseAnalysis(entries);

    const unclassified = result.byCategory.find((c) => c.category === "미분류");
    expect(unclassified).toBeDefined();
    expect(unclassified?.totalAmount).toBe("25000");
    expect(unclassified?.count).toBe(2);

    const food = result.byCategory.find((c) => c.category === "식비");
    expect(food?.totalAmount).toBe("20000");
    expect(food?.count).toBe(1);
  });

  it("U04: 월말 UTC/KST 경계 시 사용자 타임존 기준 월에 포함되어야 한다", () => {
    // 2026-07-31T20:00:00Z = 2026-08-01T05:00:00+09:00 (KST)
    const entries: ExpenseEntry[] = [
      createMockEntry({ itemId: "1", amount: "10000", currency: "KRW", occurredAt: "2026-07-31T20:00:00Z" }),
    ];

    const resultKst = calculateExpenseAnalysis(entries, { timeZone: "Asia/Seoul" });
    expect(resultKst.monthly[0].month).toBe("2026-08");

    const resultUtc = calculateExpenseAnalysis(entries, { timeZone: "UTC" });
    expect(resultUtc.monthly[0].month).toBe("2026-07");
  });

  it("U05: 0원 비용도 유효한 기록으로 정상 집계되어야 한다", () => {
    const entries: ExpenseEntry[] = [
      createMockEntry({ itemId: "1", amount: "0", currency: "KRW", occurredAt: "2026-08-01T10:00:00Z", category: "프로모션" }),
    ];

    const result = calculateExpenseAnalysis(entries);
    expect(result.totals[0].totalAmount).toBe("0");
    expect(result.totals[0].count).toBe(1);
    expect(result.byCategory[0].totalAmount).toBe("0");
  });

  it("U06: 소수점 통화의 정밀도가 보존되어야 한다", () => {
    const entries: ExpenseEntry[] = [
      createMockEntry({ itemId: "1", amount: "10.25", currency: "USD", occurredAt: "2026-08-01T10:00:00Z" }),
      createMockEntry({ itemId: "2", amount: "5.50", currency: "USD", occurredAt: "2026-08-02T10:00:00Z" }),
    ];

    const result = calculateExpenseAnalysis(entries);
    expect(result.totals[0].totalAmount).toBe("15.75");
  });

  it("U07: 분류별 지출 비율(ratio)이 정확히 산출되어야 한다", () => {
    const entries: ExpenseEntry[] = [
      createMockEntry({ itemId: "1", amount: "80000", currency: "KRW", occurredAt: "2026-08-01T10:00:00Z", category: "교통비" }),
      createMockEntry({ itemId: "2", amount: "20000", currency: "KRW", occurredAt: "2026-08-02T10:00:00Z", category: "식비" }),
    ];

    const result = calculateExpenseAnalysis(entries);
    const transport = result.byCategory.find((c) => c.category === "교통비");
    const food = result.byCategory.find((c) => c.category === "식비");

    expect(transport?.ratio).toBe(0.8);
    expect(food?.ratio).toBe(0.2);
  });
});
