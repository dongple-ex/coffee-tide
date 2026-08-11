import { getFinanceSnapshot } from "@/lib/finance/snapshot";
import type { CloudToolDefinition } from "../types";

export const financeSnapshotTool: CloudToolDefinition = {
  id: "finance.market_snapshot",
  version: 1,
  name: "한국은행 환율·금리 조회",
  description: "한국은행 ECOS에서 최신 USD·JPY·EUR 환율과 기준금리를 조회합니다.",
  inputSchema: {
    type: "object",
    properties: {
      currency: {
        type: "string",
        description: "표시할 통화입니다.",
        enum: ["ALL", "USD", "JPY", "EUR"],
        default: "ALL",
      },
    },
    additionalProperties: false,
  },
  effect: "read_only",
  confirmation: "none",
  timeoutMs: 15_000,
  maxOutputBytes: 128 * 1024,
  async execute(input) {
    const currency = typeof input.currency === "string" ? input.currency : "ALL";
    const response = await getFinanceSnapshot(false);
    const exchangeRates = response.finance.exchangeRates.filter(
      (quote) => currency === "ALL" || quote.code === currency
    );
    const baseRate = response.finance.interestRates[0];
    const exchangeLines = exchangeRates.map(
      (quote) =>
        `- ${quote.code}: ${quote.rate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원${
          quote.unit === 100 ? " (100엔 기준)" : ""
        }`
    );
    const summary = [
      "### ☁️ Cloud Tool · 한국은행 환율·금리",
      response.finance.exchangeDate ? `- 환율 기준일: ${response.finance.exchangeDate}` : "",
      ...exchangeLines,
      baseRate ? `- 한국은행 기준금리: ${baseRate.rate.toFixed(2)}% (${baseRate.baseDate})` : "",
      response.cached ? `- 조회 상태: ${response.stale ? "이전 캐시" : "1시간 캐시"}` : "- 조회 상태: 새로 조회",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      success: response.success,
      summary: response.success
        ? summary
        : "한국은행 환율·금리 데이터를 조회하지 못했습니다. 서버 API 키와 ECOS 응답을 확인해 주세요.",
      data: {
        exchangeDate: response.finance.exchangeDate,
        exchangeRates,
        interestRate: baseRate,
        fetchedAt: response.finance.fetchedAt,
        cached: response.cached,
        stale: response.stale ?? false,
      },
      sources: [
        { label: "한국은행 경제통계시스템 ECOS", url: "https://ecos.bok.or.kr/" },
      ],
      warnings: [...(response.warnings ?? []), ...(response.missing ?? [])],
    };
  },
};
