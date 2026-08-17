import { describe, expect, it } from "vitest";
import { generateExpensesCsv, sanitizeCsvCell, type ExpenseExportRow } from "./export";

describe("CSV Export & Security", () => {
  it("U09: CSV 한글·쉼표·따옴표가 포함된 행이 올바르게 이스케이프되고 UTF-8 BOM이 포함되어야 한다", () => {
    const rows: ExpenseExportRow[] = [
      {
        occurredAt: "2026-08-17T12:00:00Z",
        title: '점심 "특선", 카페',
        merchant: "스타벅스 강남점",
        category: "식비",
        amount: "15000",
        currency: "KRW",
        paymentMethod: "법인카드",
        receiptCount: 1,
      },
    ];

    const csv = generateExpensesCsv(rows);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"점심 ""특선"", 카페"');
    expect(csv).toContain("스타벅스 강남점");
    expect(csv).toContain("\r\n");
  });

  it("U10: CSV 수식 시작 문자열(=, +, -, @, \\t, \\r)이 작은따옴표로 안전하게 무력화되어야 한다", () => {
    expect(sanitizeCsvCell("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
    expect(sanitizeCsvCell("=1+1")).toBe("'=1+1");
    expect(sanitizeCsvCell("+cmd|' /C calc'!'A1'")).toBe("'+cmd|' /C calc'!'A1'");
    expect(sanitizeCsvCell("-5000")).toBe("'-5000");
    expect(sanitizeCsvCell("@admin")).toBe("'@admin");

    const attackRows: ExpenseExportRow[] = [
      {
        occurredAt: "2026-08-17",
        title: "=cmd|' /C calc'!'A1'",
        merchant: "@hacker",
        category: "+식비",
        amount: "-1000",
        currency: "KRW",
        paymentMethod: "현금",
        receiptCount: 0,
      },
    ];

    const csv = generateExpensesCsv(attackRows);
    expect(csv).toContain("'=cmd|' /C calc'!'A1'");
    expect(csv).toContain("'@hacker");
    expect(csv).toContain("'+식비");
    expect(csv).toContain("'-1000");
  });
});
