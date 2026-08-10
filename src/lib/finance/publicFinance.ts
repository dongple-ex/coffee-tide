import type {
  ExchangeRateQuote,
  FinanceHistoryPoint,
  FinanceSnapshot,
  InterestRateQuote,
} from "@/lib/types/finance";

const BOK_ECOS_URL = "https://ecos.bok.or.kr/api/StatisticSearch";

interface EcosRow {
  ITEM_CODE1?: string;
  ITEM_NAME1?: string;
  UNIT_NAME?: string;
  TIME?: string;
  DATA_VALUE?: string;
}

interface EcosResponse {
  StatisticSearch?: {
    row?: EcosRow[];
  };
  RESULT?: {
    CODE?: string;
    MESSAGE?: string;
  };
}

const ECOS_EXCHANGE_ITEMS = [
  { itemCode: "0000001", code: "USD" as const, label: "미국 달러", unit: 1 },
  { itemCode: "0000002", code: "JPY" as const, label: "일본 엔", unit: 100 },
  { itemCode: "0000003", code: "EUR" as const, label: "유로", unit: 1 },
];

function formatSeoulDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}`;
}

function parseNumber(value?: string): number | null {
  if (!value) return null;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPastDate(months: number): string {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return formatSeoulDate(date);
}

export function parseEcosHistory(response: EcosResponse): FinanceHistoryPoint[] {
  return (response.StatisticSearch?.row ?? [])
    .flatMap((row) => {
      const value = parseNumber(row.DATA_VALUE);
      return row.TIME && value !== null ? [{ date: row.TIME, value }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function latestEcosRow(response: EcosResponse): EcosRow | null {
  return (
    [...(response.StatisticSearch?.row ?? [])]
      .filter((row) => row.TIME && parseNumber(row.DATA_VALUE) !== null)
      .sort((a, b) => (a.TIME ?? "").localeCompare(b.TIME ?? ""))
      .at(-1) ?? null
  );
}

export function parseBaseRate(response: EcosResponse): InterestRateQuote | null {
  const latest = latestEcosRow(response);
  const rate = parseNumber(latest?.DATA_VALUE);
  if (!latest?.TIME || rate === null) return null;

  return {
    code: "BOK_BASE_RATE",
    label: latest.ITEM_NAME1 || "한국은행 기준금리",
    rate,
    unit: "연%",
    baseDate: latest.TIME,
    history: parseEcosHistory(response),
  };
}

function buildEcosUrl(
  apiKey: string,
  statisticCode: string,
  startDate: string,
  endDate: string,
  itemCode: string,
  endRow = 1000
): string {
  return [
    BOK_ECOS_URL,
    encodeURIComponent(apiKey),
    "json",
    "kr",
    "1",
    String(endRow),
    statisticCode,
    "D",
    startDate,
    endDate,
    itemCode,
  ].join("/");
}

async function fetchEcosResponse(url: string): Promise<EcosResponse> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`한국은행 ECOS API HTTP ${response.status}`);
  return (await response.json()) as EcosResponse;
}

export async function fetchBokExchangeRates(
  apiKey: string
): Promise<{ exchangeDate: string; exchangeRates: ExchangeRateQuote[] }> {
  const endDate = formatSeoulDate(new Date());
  const startDate = formatPastDate(3);

  const results = await Promise.all(
    ECOS_EXCHANGE_ITEMS.map(async (target) => {
      const payload = await fetchEcosResponse(
        buildEcosUrl(apiKey, "731Y001", startDate, endDate, target.itemCode)
      );
      const latest = latestEcosRow(payload);
      const rate = parseNumber(latest?.DATA_VALUE);
      if (!latest?.TIME || rate === null) {
        throw new Error(
          payload.RESULT?.MESSAGE || `한국은행 ${target.label} 환율 데이터를 찾지 못했습니다.`
        );
      }
      return {
        baseDate: latest.TIME,
        quote: {
          code: target.code,
          label: target.label,
          unit: target.unit,
          rate,
          history: parseEcosHistory(payload),
        } satisfies ExchangeRateQuote,
      };
    })
  );

  const exchangeDate = results
    .map((result) => result.baseDate)
    .sort((a, b) => a.localeCompare(b))
    .at(-1);
  if (!exchangeDate) throw new Error("한국은행 환율 데이터를 찾지 못했습니다.");

  return {
    exchangeDate,
    exchangeRates: results.map((result) => result.quote),
  };
}

export async function fetchBokBaseRate(apiKey: string): Promise<InterestRateQuote> {
  const endDate = formatSeoulDate(new Date());
  const startDate = formatPastDate(12);
  const payload = await fetchEcosResponse(
    buildEcosUrl(apiKey, "722Y001", startDate, endDate, "0101000", 1000)
  );
  const baseRate = parseBaseRate(payload);
  if (!baseRate) {
    throw new Error(payload.RESULT?.MESSAGE || "한국은행 기준금리 데이터를 찾지 못했습니다.");
  }
  return baseRate;
}

export function emptyFinanceSnapshot(): FinanceSnapshot {
  return {
    exchangeRates: [],
    interestRates: [],
    fetchedAt: new Date().toISOString(),
  };
}
