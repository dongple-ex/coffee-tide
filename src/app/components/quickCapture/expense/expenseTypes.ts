import type { ContentAsset, ExpenseEntry, WorkspaceItem } from "@/lib/data/contracts";
import type { ExpenseAnalysisResponse } from "@/lib/expenses/analysis";

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

export interface ExpenseState {
  records: ExpenseListRecord[];
  analysis?: ExpenseAnalysisResponse;
  loading: boolean;
  loadingMore: boolean;
  mutatingId?: string;
  error?: string;
  filters: ExpenseFilters;
  nextCursor?: string;
}
