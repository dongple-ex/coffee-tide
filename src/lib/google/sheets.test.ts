import { describe, expect, it } from "vitest";
import {
  buildCreateSpreadsheetPayload,
  buildSpreadsheetValueRanges,
  buildChartRequests,
  SHEET_NAMES,
} from "./sheets";
import type { ExpenseAnalysisResponse } from "../expenses/analysis";

describe("Google Sheets Payload & Charts", () => {
  it("U11: 4개 시트(비용내역, 월별합계, 분류별분석, 대시보드) 생성 payload가 정확해야 한다", () => {
    const payload = buildCreateSpreadsheetPayload("CoffeeTide 비용 2026-08");

    expect(payload.properties.title).toBe("CoffeeTide 비용 2026-08");
    expect(payload.sheets).toHaveLength(4);
    expect(payload.sheets[0].properties.title).toBe(SHEET_NAMES.DETAILS);
    expect(payload.sheets[1].properties.title).toBe(SHEET_NAMES.MONTHLY);
    expect(payload.sheets[2].properties.title).toBe(SHEET_NAMES.CATEGORY);
    expect(payload.sheets[3].properties.title).toBe(SHEET_NAMES.DASHBOARD);
  });

  it("U12: 다중 통화(KRW, USD)가 있을 때 각각 행이 분리되어 기록되어야 한다", () => {
    const mockAnalysis: ExpenseAnalysisResponse = {
      range: { from: "2026-08-01", to: "2026-08-31", timeZone: "Asia/Seoul" },
      totals: [
        { currency: "KRW", totalAmount: "100000", count: 2, averageAmount: "50000" },
        { currency: "USD", totalAmount: "50.00", count: 1, averageAmount: "50.00" },
      ],
      monthly: [
        { currency: "KRW", month: "2026-08", totalAmount: "100000", count: 2, averageAmount: "50000" },
        { currency: "USD", month: "2026-08", totalAmount: "50.00", count: 1, averageAmount: "50.00" },
      ],
      byCategory: [
        { currency: "KRW", category: "식비", totalAmount: "100000", count: 2, averageAmount: "50000", ratio: 1 },
        { currency: "USD", category: "도서", totalAmount: "50.00", count: 1, averageAmount: "50.00", ratio: 1 },
      ],
    };

    const valueRanges = buildSpreadsheetValueRanges({
      title: "비용 리포트",
      userEmail: "test@example.com",
      rangeText: "2026-08-01 ~ 2026-08-31",
      filterText: "전체",
      rows: [],
      analysis: mockAnalysis,
    });

    expect(valueRanges.valueRanges).toHaveLength(5);
    const monthlyRange = valueRanges.valueRanges.find((r) => r.range.startsWith(SHEET_NAMES.MONTHLY));
    expect(monthlyRange?.values).toHaveLength(3); // Header + KRW + USD
  });

  it("U16: 통화마다 월간 지출 추이(COLUMN)와 분류별 지출(BAR) 차트 2개가 생성되어야 한다", () => {
    const mockAnalysis: ExpenseAnalysisResponse = {
      range: { from: "2026-08-01", to: "2026-08-31", timeZone: "Asia/Seoul" },
      totals: [
        { currency: "KRW", totalAmount: "100000", count: 2 },
        { currency: "USD", totalAmount: "50.00", count: 1 },
      ],
      monthly: [
        { currency: "KRW", month: "2026-08", totalAmount: "100000", count: 2 },
        { currency: "USD", month: "2026-08", totalAmount: "50.00", count: 1 },
      ],
      byCategory: [
        { currency: "KRW", category: "식비", totalAmount: "100000", count: 2, ratio: 1 },
        { currency: "USD", category: "도서", totalAmount: "50.00", count: 1, ratio: 1 },
      ],
    };

    const requests = buildChartRequests(mockAnalysis);
    // KRW 2개 + USD 2개 = 총 4개 차트
    const firstRequest = requests[0] as {
      addChart: { chart: { spec: { title: string; hiddenDimensionStrategy: string } } };
    };
    expect(firstRequest.addChart.chart.spec.title).toContain("KRW");
    expect(firstRequest.addChart.chart.spec.hiddenDimensionStrategy).toBe("SHOW_ALL");
  });
});
