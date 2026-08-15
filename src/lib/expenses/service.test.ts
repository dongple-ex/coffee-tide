import { describe, it, expect } from "vitest";
import { buildExpenseItems, calculateExpenseSummary } from "./service";
import type { ExpenseEntry } from "../data/contracts";

describe("Phase 14-05: 비용 서비스 및 요약 집계 테스트", () => {
  it("E08: 100건의 비용 데이터에서 통화별 합계를 정확히 집계한다", () => {
    const entries: ExpenseEntry[] = [];

    // KRW 50건 (각 10,000원 = 500,000원)
    for (let i = 0; i < 50; i++) {
      entries.push({
        itemId: `exp-krw-${i}`,
        amount: "10000",
        currency: "KRW",
        occurredAt: "2026-08-14T09:00:00Z",
        taxDeductible: false,
        reimbursable: false,
      });
    }

    // USD 50건 (각 20달러 = 1,000달러)
    for (let i = 0; i < 50; i++) {
      entries.push({
        itemId: `exp-usd-${i}`,
        amount: "20",
        currency: "USD",
        occurredAt: "2026-08-14T09:00:00Z",
        taxDeductible: false,
        reimbursable: false,
      });
    }

    const summary = calculateExpenseSummary(entries);

    expect(summary.totalEntriesCount).toBe(100);
    expect(summary.totals).toHaveLength(2);

    const krwTotal = summary.totals.find((t) => t.currency === "KRW");
    expect(krwTotal?.totalAmount).toBe(500000);
    expect(krwTotal?.count).toBe(50);

    const usdTotal = summary.totals.find((t) => t.currency === "USD");
    expect(usdTotal?.totalAmount).toBe(1000);
    expect(usdTotal?.count).toBe(50);
  });

  it("비용 항목 생성 시 workspaceItem의 itemType이 'expense'로 올바르게 설정된다", () => {
    const { workspaceItem, expenseEntry } = buildExpenseItems({
      title: "점심 식대",
      amount: "15000",
      currency: "KRW",
      category: "식비",
    });

    expect(workspaceItem.itemType).toBe("expense");
    expect(workspaceItem.id).toBe(expenseEntry.itemId);
    expect(expenseEntry.amount).toBe("15000");
  });

  it("재시도 시 사용할 클라이언트 itemId를 그대로 보존한다", () => {
    const { workspaceItem, expenseEntry } = buildExpenseItems({
      itemId: "expense-request-123",
      title: "택시비",
      amount: "18500",
      currency: "KRW",
    });

    expect(workspaceItem.id).toBe("expense-request-123");
    expect(expenseEntry.itemId).toBe("expense-request-123");
  });
});
