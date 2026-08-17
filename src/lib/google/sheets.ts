import type { ExpenseAnalysisResponse } from "../expenses/analysis";
import type { ExpenseExportRow } from "../expenses/export";

export interface GoogleSheetsExportConfig {
  title: string;
  userEmail?: string;
  rangeText: string;
  filterText: string;
  rows: ExpenseExportRow[];
  analysis: ExpenseAnalysisResponse;
}

export interface GoogleSheetsExportResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  rowCount: number;
  sheetCount: number;
  chartCount: number;
  warnings: string[];
}

export const SHEET_NAMES = {
  DETAILS: "비용내역",
  MONTHLY: "월별합계",
  CATEGORY: "분류별분석",
  DASHBOARD: "대시보드",
} as const;

export const SHEET_IDS = {
  DETAILS: 0,
  MONTHLY: 1,
  CATEGORY: 2,
  DASHBOARD: 3,
};

/**
 * 4개 시트(비용내역, 월별합계, 분류별분석, 대시보드)를 가진 스프레드시트 초기 생성 payload
 */
export function buildCreateSpreadsheetPayload(title: string) {
  return {
    properties: {
      title,
      locale: "ko_KR",
      autoRecalc: "ON_CHANGE",
    },
    sheets: [
      { properties: { sheetId: SHEET_IDS.DETAILS, title: SHEET_NAMES.DETAILS, gridProperties: { frozenRowCount: 1 } } },
      { properties: { sheetId: SHEET_IDS.MONTHLY, title: SHEET_NAMES.MONTHLY, gridProperties: { frozenRowCount: 1 } } },
      { properties: { sheetId: SHEET_IDS.CATEGORY, title: SHEET_NAMES.CATEGORY, gridProperties: { frozenRowCount: 1 } } },
      { properties: { sheetId: SHEET_IDS.DASHBOARD, title: SHEET_NAMES.DASHBOARD } },
    ],
  };
}

/**
 * 4개 시트에 일괄 기록할 valueRanges 생성
 */
export function buildSpreadsheetValueRanges(config: GoogleSheetsExportConfig) {
  const { title, userEmail, rangeText, filterText, rows, analysis } = config;

  // 1. 비용내역
  const detailsValues = [
    ["사용 일시", "제목", "사용처", "분류", "금액", "통화", "결제수단", "영수증 수"],
    ...rows.map((r) => [
      r.occurredAt,
      r.title,
      r.merchant,
      r.category,
      Number(r.amount) || 0,
      r.currency,
      r.paymentMethod,
      r.receiptCount,
    ]),
  ];

  // 2. 월별합계 (통화별 분리)
  const monthlyValues = [
    ["월", "통화", "지출 합계", "비용 건수", "건당 평균"],
    ...analysis.monthly.map((m) => [
      m.month,
      m.currency,
      Number(m.totalAmount) || 0,
      m.count,
      Number(m.averageAmount) || 0,
    ]),
  ];

  // 3. 분류별분석 (통화별 분리)
  const categoryValues = [
    ["분류", "통화", "지출 합계", "비용 건수", "지출 비중"],
    ...analysis.byCategory.map((c) => [
      c.category,
      c.currency,
      Number(c.totalAmount) || 0,
      c.count,
      c.ratio !== undefined ? `${(c.ratio * 100).toFixed(1)}%` : "0.0%",
    ]),
  ];

  // 4. 대시보드 요약 및 숨김 차트 보조 데이터
  const dashboardValues = [
    [title],
    ["생성 일시", new Date().toISOString().replace("T", " ").slice(0, 19)],
    ["계정", userEmail || "-"],
    ["조회 기간", rangeText],
    ["적용 필터", filterText],
    ["전체 건수", rows.length],
    [],
    ["[통화별 지출 요약]"],
    ["통화", "총 지출액", "비용 건수", "건당 평균"],
    ...analysis.totals.map((t) => [
      t.currency,
      Number(t.totalAmount) || 0,
      t.count,
      Number(t.averageAmount) || 0,
    ]),
  ];

  // 대시보드 J열(Column 9)부터 상위 8개+기타 차트 보조 데이터 기록
  const chartHelperValues: (string | number)[][] = [
    ["통화", "분류", "금액", "건수"],
  ];

  for (const total of analysis.totals) {
    const catRows = analysis.byCategory.filter((c) => c.currency === total.currency);
    const top8 = catRows.slice(0, 8);
    const rest = catRows.slice(8);

    for (const item of top8) {
      chartHelperValues.push([item.currency, item.category, Number(item.totalAmount) || 0, item.count]);
    }

    if (rest.length > 0) {
      const restTotal = rest.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
      const restCount = rest.reduce((sum, r) => sum + r.count, 0);
      chartHelperValues.push([total.currency, "기타", restTotal, restCount]);
    }
  }

  return {
    valueRanges: [
      { range: `${SHEET_NAMES.DETAILS}!A1`, values: detailsValues },
      { range: `${SHEET_NAMES.MONTHLY}!A1`, values: monthlyValues },
      { range: `${SHEET_NAMES.CATEGORY}!A1`, values: categoryValues },
      { range: `${SHEET_NAMES.DASHBOARD}!A1`, values: dashboardValues },
      { range: `${SHEET_NAMES.DASHBOARD}!J1`, values: chartHelperValues },
    ],
  };
}

/**
 * 통화별 차트 2종(월간 추이 COLUMN, 분류별 BAR) AddChartRequest 목록 생성
 */
export function buildChartRequests(analysis: ExpenseAnalysisResponse): Record<string, unknown>[] {
  const requests: Record<string, unknown>[] = [];
  let chartOffsetIndex = 0;

  let helperRowCursor = 2; // J1은 헤더이므로 row index 2 (1-based)부터

  for (const total of analysis.totals) {
    const currency = total.currency;
    const monthlyRows = analysis.monthly.filter((m) => m.currency === currency);
    const monthlyStartIndex = analysis.monthly.findIndex((m) => m.currency === currency);

    // 1. 월간 지출 추이 (세로 막대 차트 - 월별합계 시트 참조)
    if (monthlyRows.length > 0 && monthlyStartIndex !== -1) {
      const startRow = monthlyStartIndex + 1; // 0-based header=0 -> startRow=1
      const endRow = startRow + monthlyRows.length;

      requests.push({
        addChart: {
          chart: {
            spec: {
              title: `[${currency}] 월간 지출 추이`,
              altText: `${currency} 통화의 월별 지출 합계 추이 차트입니다.`,
              hiddenDimensionStrategy: "SHOW_ALL",
              basicChart: {
                chartType: "COLUMN",
                legendPosition: "NONE",
                axis: [
                  { position: "BOTTOM_AXIS", title: "월" },
                  { position: "LEFT_AXIS", title: `지출액 (${currency})` },
                ],
                domains: [
                  {
                    domain: {
                      sourceRange: {
                        sources: [
                          {
                            sheetId: SHEET_IDS.MONTHLY,
                            startRowIndex: startRow,
                            endRowIndex: endRow,
                            startColumnIndex: 0, // A열 (월)
                            endColumnIndex: 1,
                          },
                        ],
                      },
                    },
                  },
                ],
                series: [
                  {
                    series: {
                      sourceRange: {
                        sources: [
                          {
                            sheetId: SHEET_IDS.MONTHLY,
                            startRowIndex: startRow,
                            endRowIndex: endRow,
                            startColumnIndex: 2, // C열 (지출 합계)
                            endColumnIndex: 3,
                          },
                        ],
                      },
                    },
                    targetAxis: "LEFT_AXIS",
                  },
                ],
              },
            },
            position: {
              overlayPosition: {
                anchorCell: {
                  sheetId: SHEET_IDS.DASHBOARD,
                  rowIndex: 14 + chartOffsetIndex * 24,
                  columnIndex: 0,
                },
                widthPixels: 850,
                heightPixels: 400,
              },
            },
          },
        },
      });
      chartOffsetIndex++;
    }

    // 2. 분류별 지출 (가로 막대 차트 - 대시보드 J:M 숨김 보조 데이터 참조)
    const catRows = analysis.byCategory.filter((c) => c.currency === currency);
    const top8Count = Math.min(catRows.length, 8) + (catRows.length > 8 ? 1 : 0);

    if (top8Count > 0) {
      const helperStartRow = helperRowCursor - 1; // 0-based
      const helperEndRow = helperStartRow + top8Count;
      helperRowCursor += top8Count;

      requests.push({
        addChart: {
          chart: {
            spec: {
              title: `[${currency}] 분류별 지출 비중`,
              altText: `${currency} 통화의 상위 분류별 지출 차트입니다.`,
              hiddenDimensionStrategy: "SHOW_ALL",
              basicChart: {
                chartType: "BAR",
                legendPosition: "NONE",
                axis: [
                  { position: "BOTTOM_AXIS", title: `지출액 (${currency})` },
                  { position: "LEFT_AXIS", title: "분류" },
                ],
                domains: [
                  {
                    domain: {
                      sourceRange: {
                        sources: [
                          {
                            sheetId: SHEET_IDS.DASHBOARD,
                            startRowIndex: helperStartRow,
                            endRowIndex: helperEndRow,
                            startColumnIndex: 10, // K열 (분류)
                            endColumnIndex: 11,
                          },
                        ],
                      },
                    },
                  },
                ],
                series: [
                  {
                    series: {
                      sourceRange: {
                        sources: [
                          {
                            sheetId: SHEET_IDS.DASHBOARD,
                            startRowIndex: helperStartRow,
                            endRowIndex: helperEndRow,
                            startColumnIndex: 11, // L열 (금액)
                            endColumnIndex: 12,
                          },
                        ],
                      },
                    },
                    targetAxis: "BOTTOM_AXIS",
                  },
                ],
              },
            },
            position: {
              overlayPosition: {
                anchorCell: {
                  sheetId: SHEET_IDS.DASHBOARD,
                  rowIndex: 14 + chartOffsetIndex * 24,
                  columnIndex: 0,
                },
                widthPixels: 850,
                heightPixels: 400,
              },
            },
          },
        },
      });
      chartOffsetIndex++;
    }
  }

  return requests;
}

/**
 * Google Drive에서 파일 삭제 (보상 삭제용)
 */
export async function deleteGoogleDriveFile(accessToken: string, fileId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
