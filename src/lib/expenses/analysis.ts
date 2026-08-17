import type { ExpenseEntry } from "../data/contracts";

export interface ExpenseAggregateRow {
  currency: string;
  totalAmount: string;
  count: number;
  averageAmount?: string;
}

export interface ExpenseMonthlyRow extends ExpenseAggregateRow {
  month: string; // YYYY-MM
}

export interface ExpenseCategoryRow extends ExpenseAggregateRow {
  category: string;
  ratio?: number; // 0.0 ~ 1.0
}

export interface ExpenseAnalysisResponse {
  range: { from: string; to: string; timeZone: string };
  totals: ExpenseAggregateRow[];
  monthly: ExpenseMonthlyRow[];
  byCategory: ExpenseCategoryRow[];
}

export interface ExpenseAnalysisOptions {
  from?: string;
  to?: string;
  timeZone?: string;
  months?: number;
}

/**
 * UTC ISO 문자열을 지정된 IANA 타임존의 YYYY-MM 형식으로 변환합니다.
 */
export function formatYearMonthInTimeZone(isoDateString: string, timeZone: string = "Asia/Seoul"): string {
  try {
    const date = new Date(isoDateString);
    if (Number.isNaN(date.getTime())) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
    });
    return formatter.format(date); // en-CA gives YYYY-MM
  } catch {
    // 유효하지 않은 타임존일 경우 Asia/Seoul로 폴백
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
    });
    return formatter.format(new Date(isoDateString));
  }
}

/**
 * 부동소수점 오차를 최소화하며 문자열 금액을 합산합니다.
 */
function addAmounts(a: string, b: string): string {
  const numA = Number(a) || 0;
  const numB = Number(b) || 0;
  const sum = numA + numB;
  // 소수점 4자리 이하 절삭/정규화
  return Number.isInteger(sum) ? sum.toString() : sum.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * 비용 항목 목록에서 통화별/월별/분류별 집계를 수행합니다.
 * 서로 다른 통화는 절대 하나의 총액으로 합산하지 않습니다.
 */
export function calculateExpenseAnalysis(
  entries: ExpenseEntry[],
  options: ExpenseAnalysisOptions = {}
): ExpenseAnalysisResponse {
  const timeZone = options.timeZone || "Asia/Seoul";
  const from = options.from || "";
  const to = options.to || "";

  // 1. 통화별 Totals 집계
  const currencyTotalsMap = new Map<string, { total: string; count: number }>();
  // 2. 월별-통화별 집계 (key: `${currency}__${month}`)
  const monthlyMap = new Map<string, { currency: string; month: string; total: string; count: number }>();
  // 3. 분류별-통화별 집계 (key: `${currency}__${category}`)
  const categoryMap = new Map<string, { currency: string; category: string; total: string; count: number }>();

  for (const entry of entries) {
    const currency = (entry.currency || "KRW").toUpperCase().trim();
    const amountStr = (entry.amount || "0").trim();
    const category = (entry.category || "").trim() || "미분류";
    const month = formatYearMonthInTimeZone(entry.occurredAt, timeZone);

    // Totals
    const curTotal = currencyTotalsMap.get(currency) || { total: "0", count: 0 };
    currencyTotalsMap.set(currency, {
      total: addAmounts(curTotal.total, amountStr),
      count: curTotal.count + 1,
    });

    // Monthly
    const monthKey = `${currency}__${month}`;
    const curMonth = monthlyMap.get(monthKey) || { currency, month, total: "0", count: 0 };
    monthlyMap.set(monthKey, {
      ...curMonth,
      total: addAmounts(curMonth.total, amountStr),
      count: curMonth.count + 1,
    });

    // Category
    const catKey = `${currency}__${category}`;
    const curCat = categoryMap.get(catKey) || { currency, category, total: "0", count: 0 };
    categoryMap.set(catKey, {
      ...curCat,
      total: addAmounts(curCat.total, amountStr),
      count: curCat.count + 1,
    });
  }

  // totals 배열 생성 및 정렬 (통화 오름차순)
  const totals: ExpenseAggregateRow[] = Array.from(currencyTotalsMap.entries())
    .map(([currency, data]) => {
      const avg = data.count > 0 ? ((Number(data.total) || 0) / data.count).toFixed(2).replace(/\.?0+$/, "") : "0";
      return {
        currency,
        totalAmount: data.total,
        count: data.count,
        averageAmount: avg,
      };
    })
    .sort((a, b) => a.currency.localeCompare(b.currency));

  // monthly 배열 생성 및 정렬 (통화 오름차순, 월 오름차순)
  const monthly: ExpenseMonthlyRow[] = Array.from(monthlyMap.values())
    .map((item) => {
      const avg = item.count > 0 ? ((Number(item.total) || 0) / item.count).toFixed(2).replace(/\.?0+$/, "") : "0";
      return {
        currency: item.currency,
        month: item.month,
        totalAmount: item.total,
        count: item.count,
        averageAmount: avg,
      };
    })
    .sort((a, b) => {
      if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
      return a.month.localeCompare(b.month);
    });

  // category 배열 생성 및 정렬 (통화 오름차순, 금액 내림차순)
  const byCategory: ExpenseCategoryRow[] = Array.from(categoryMap.values())
    .map((item) => {
      const curTotalObj = currencyTotalsMap.get(item.currency);
      const curTotalNum = curTotalObj ? Number(curTotalObj.total) || 0 : 0;
      const itemTotalNum = Number(item.total) || 0;
      const ratio = curTotalNum > 0 ? Number((itemTotalNum / curTotalNum).toFixed(4)) : 0;
      const avg = item.count > 0 ? (itemTotalNum / item.count).toFixed(2).replace(/\.?0+$/, "") : "0";

      return {
        currency: item.currency,
        category: item.category,
        totalAmount: item.total,
        count: item.count,
        averageAmount: avg,
        ratio,
      };
    })
    .sort((a, b) => {
      if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
      return (Number(b.totalAmount) || 0) - (Number(a.totalAmount) || 0);
    });

  return {
    range: {
      from,
      to,
      timeZone,
    },
    totals,
    monthly,
    byCategory,
  };
}
