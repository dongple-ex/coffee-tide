import type { ContentAsset, ExpenseEntry, WorkspaceItem } from "@/lib/data/contracts";

export interface ExpenseListRecord {
  item: WorkspaceItem;
  entry: ExpenseEntry;
  receipts: ContentAsset[];
}

export interface ExpenseFilters {
  from?: string;
  to?: string;
  category?: string;
  currency?: string;
}

/** ISO 문자열을 datetime-local 입력값(로컬 기준 YYYY-MM-DDTHH:mm)으로 변환 */
export function toLocalDateTimeInput(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
