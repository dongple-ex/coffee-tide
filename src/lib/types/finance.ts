export interface FinanceHistoryPoint {
  date: string;
  value: number;
}

export interface ExchangeRateQuote {
  code: "USD" | "JPY" | "EUR";
  label: string;
  unit: number;
  rate: number;
  history: FinanceHistoryPoint[];
}

export interface InterestRateQuote {
  code: "BOK_BASE_RATE";
  label: string;
  rate: number;
  unit: "연%";
  baseDate: string;
  history: FinanceHistoryPoint[];
}

export interface FinanceSnapshot {
  exchangeDate?: string;
  exchangeRates: ExchangeRateQuote[];
  interestRates: InterestRateQuote[];
  fetchedAt: string;
}

export interface FinanceApiResponse {
  success: boolean;
  finance: FinanceSnapshot;
  cached: boolean;
  stale?: boolean;
  missing?: Array<"BOK_ECOS_API_KEY">;
  warnings?: string[];
}
