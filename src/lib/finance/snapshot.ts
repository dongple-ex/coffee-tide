import "server-only";

import {
  emptyFinanceSnapshot,
  fetchBokBaseRate,
  fetchBokExchangeRates,
} from "@/lib/finance/publicFinance";
import type { FinanceApiResponse, FinanceSnapshot } from "@/lib/types/finance";

const CACHE_TTL_MS = 60 * 60 * 1000;

let cache: {
  timestamp: number;
  data: FinanceSnapshot;
  missing?: FinanceApiResponse["missing"];
  warnings?: string[];
} | null = null;

export async function getFinanceSnapshot(forceRefresh = false): Promise<FinanceApiResponse> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.timestamp < CACHE_TTL_MS) {
    return {
      success: true,
      finance: cache.data,
      cached: true,
      missing: cache.missing,
      warnings: cache.warnings,
    };
  }

  const ecosKey = process.env.BOK_ECOS_API_KEY;
  const missing: FinanceApiResponse["missing"] = [];
  const warnings: string[] = [];
  const finance = emptyFinanceSnapshot();

  if (!ecosKey) missing.push("BOK_ECOS_API_KEY");

  const [exchangeResult, interestResult] = await Promise.allSettled([
    ecosKey ? fetchBokExchangeRates(ecosKey) : Promise.resolve(null),
    ecosKey ? fetchBokBaseRate(ecosKey) : Promise.resolve(null),
  ]);

  if (exchangeResult.status === "fulfilled" && exchangeResult.value) {
    finance.exchangeDate = exchangeResult.value.exchangeDate;
    finance.exchangeRates = exchangeResult.value.exchangeRates;
  } else if (exchangeResult.status === "rejected") {
    warnings.push(
      exchangeResult.reason instanceof Error ? exchangeResult.reason.message : "환율 조회 실패"
    );
  }

  if (interestResult.status === "fulfilled" && interestResult.value) {
    finance.interestRates = [interestResult.value];
  } else if (interestResult.status === "rejected") {
    warnings.push(
      interestResult.reason instanceof Error ? interestResult.reason.message : "금리 조회 실패"
    );
  }

  finance.fetchedAt = new Date().toISOString();
  const hasData = finance.exchangeRates.length > 0 || finance.interestRates.length > 0;
  if (hasData) {
    cache = {
      timestamp: now,
      data: finance,
      missing: missing.length > 0 ? missing : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  if (!hasData && cache) {
    return {
      success: true,
      finance: cache.data,
      cached: true,
      stale: true,
      missing: missing.length > 0 ? missing : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  return {
    success: hasData,
    finance,
    cached: false,
    missing: missing.length > 0 ? missing : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
