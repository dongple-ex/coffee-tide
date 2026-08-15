import type { ExpenseEntry, WorkspaceItem } from "../data/contracts";
import { validateExpenseEntry } from "../data/validation";

export interface CreateExpenseInput {
  itemId?: string;
  title: string;
  amount: string;
  currency?: string;
  merchant?: string;
  category?: string;
  paymentMethod?: string;
  occurredAt?: string;
  taxDeductible?: boolean;
  reimbursable?: boolean;
  projectItemId?: string;
  sourceText?: string;
}

export function buildExpenseItems(
  input: CreateExpenseInput,
  userId?: string
): { workspaceItem: WorkspaceItem; expenseEntry: ExpenseEntry } {
  const itemId = input.itemId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "exp-" + Math.random().toString(36).substring(2, 12));
  const nowIso = new Date().toISOString();
  const occurredAt = input.occurredAt || nowIso;
  const currency = (input.currency || "KRW").toUpperCase();

  const expenseEntry: ExpenseEntry = {
    itemId,
    userId,
    amount: input.amount,
    currency,
    merchant: input.merchant,
    category: input.category,
    paymentMethod: input.paymentMethod,
    occurredAt,
    projectItemId: input.projectItemId,
    taxDeductible: Boolean(input.taxDeductible),
    reimbursable: Boolean(input.reimbursable),
  };

  const validation = validateExpenseEntry(expenseEntry);
  if (!validation.valid) {
    throw new Error(`비용 데이터 유효성 검증 실패: ${validation.errors.join(", ")}`);
  }

  const workspaceItem: WorkspaceItem = {
    id: itemId,
    source: "manual",
    title: input.title || `${input.merchant || input.category || "비용"} ${Number(input.amount).toLocaleString()} ${currency}`,
    content: input.sourceText || "",
    created_at: nowIso,
    author: { name: "User" },
    url: "",
    status: "pending",
    itemType: "expense",
    occurredAt,
    attributes: {
      amount: input.amount,
      currency,
      category: input.category,
      merchant: input.merchant,
    },
    version: 1,
    privacyScope: "cloud_private",
    aiPolicy: "cloud_allowed",
    updatedAt: nowIso,
  };

  return { workspaceItem, expenseEntry };
}

export interface ExpenseCurrencyTotal {
  currency: string;
  totalAmount: number;
  count: number;
}

export interface ExpenseSummary {
  totals: ExpenseCurrencyTotal[];
  totalEntriesCount: number;
}

/**
 * 비용 항목 목록에서 통화별 합산 및 건수를 정확하게 집계합니다. (서로 다른 통화 임의 합산 금지)
 */
export function calculateExpenseSummary(entries: ExpenseEntry[]): ExpenseSummary {
  const map = new Map<string, { total: number; count: number }>();

  for (const entry of entries) {
    const cur = entry.currency.toUpperCase();
    const amt = Number(entry.amount) || 0;
    const current = map.get(cur) || { total: 0, count: 0 };
    map.set(cur, {
      total: current.total + amt,
      count: current.count + 1,
    });
  }

  const totals: ExpenseCurrencyTotal[] = Array.from(map.entries()).map(([currency, data]) => ({
    currency,
    totalAmount: data.total,
    count: data.count,
  }));

  return {
    totals,
    totalEntriesCount: entries.length,
  };
}
