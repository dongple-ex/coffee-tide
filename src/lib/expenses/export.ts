import type { ContentAsset, ExpenseEntry, WorkspaceItem } from "../data/contracts";

export interface ExpenseExportRow {
  occurredAt: string;
  title: string;
  merchant: string;
  category: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  receiptCount: number;
}

/**
 * CSV 수식 주입(Formula Injection) 방어 및 특수 문자 이스케이프
 */
export function sanitizeCsvCell(rawValue: unknown): string {
  if (rawValue === null || rawValue === undefined) {
    return "";
  }
  let str = String(rawValue);

  // 수식 트리거 문자(=, +, -, @, \t, \r)로 시작하면 작은따옴표를 앞에 붙임
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // 쉼표, 큰따옴표, 줄바꿈이 포함된 경우 따옴표로 감싸고 내부 큰따옴표는 "" 처리
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function mapExpenseRecordToExportRow(record: {
  item: WorkspaceItem;
  entry: ExpenseEntry;
  receipts?: ContentAsset[];
}): ExpenseExportRow {
  return {
    occurredAt: record.entry.occurredAt || record.item.occurredAt || record.item.created_at,
    title: record.item.title || "",
    merchant: record.entry.merchant || "",
    category: record.entry.category || "미분류",
    amount: record.entry.amount || "0",
    currency: (record.entry.currency || "KRW").toUpperCase(),
    paymentMethod: record.entry.paymentMethod || "",
    receiptCount: record.receipts ? record.receipts.length : 0,
  };
}

/**
 * Excel 호환 UTF-8 BOM + CRLF 규격의 CSV 문자열을 생성합니다.
 */
export function generateExpensesCsv(rows: ExpenseExportRow[]): string {
  const headers = ["사용 일시", "제목", "사용처", "분류", "금액", "통화", "결제수단", "영수증 수"];
  const headerLine = headers.map((h) => sanitizeCsvCell(h)).join(",");

  const dataLines = rows.map((row) =>
    [
      sanitizeCsvCell(row.occurredAt),
      sanitizeCsvCell(row.title),
      sanitizeCsvCell(row.merchant),
      sanitizeCsvCell(row.category),
      sanitizeCsvCell(row.amount),
      sanitizeCsvCell(row.currency),
      sanitizeCsvCell(row.paymentMethod),
      sanitizeCsvCell(row.receiptCount),
    ].join(",")
  );

  // UTF-8 BOM (\uFEFF) + CRLF
  return `\uFEFF${[headerLine, ...dataLines].join("\r\n")}\r\n`;
}
