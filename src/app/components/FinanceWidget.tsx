"use client";

import { useState } from "react";
import type {
  FinanceHistoryPoint,
  FinanceSnapshot,
} from "@/lib/types/finance";
import styles from "./financeWidget.module.css";
import { UiIcon } from "./UiIcon";

interface FinanceWidgetProps {
  finance: FinanceSnapshot | null;
  loading: boolean;
  stale?: boolean;
  missing?: string[];
  warnings?: string[];
  onRefresh: () => void;
}

function formatSourceDate(value?: string): string {
  if (!value) return "기준일 확인 중";
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
  }
  return value;
}

function formatRate(value: number): string {
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatChartDate(value: string): string {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(2, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

interface RateTrendChartProps {
  history: FinanceHistoryPoint[];
  ariaLabel: string;
  suffix: string;
  mode?: "line" | "step";
  latestLabel?: string;
  showAllPoints?: boolean;
  monthlyAxis?: boolean;
}

function RateTrendChart({
  history,
  ariaLabel,
  suffix,
  mode = "line",
  latestLabel = "최근",
  showAllPoints = false,
  monthlyAxis = false,
}: RateTrendChartProps) {
  if (history.length === 0) {
    return <div className={styles.chartEmpty}>과거 데이터가 아직 없습니다.</div>;
  }

  const width = 320;
  const height = 126;
  const horizontalPadding = 12;
  const topPadding = 22;
  const bottomPadding = 24;
  const values = history.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawRange = rawMax - rawMin;
  const padding = rawRange > 0 ? rawRange * 0.12 : Math.max(Math.abs(rawMax) * 0.02, 0.1);
  const chartMin = rawMin - padding;
  const chartMax = rawMax + padding;
  const chartRange = chartMax - chartMin;
  const plotWidth = width - horizontalPadding * 2;
  const plotHeight = height - topPadding - bottomPadding;
  const toX = (index: number) =>
    horizontalPadding + (history.length === 1 ? plotWidth / 2 : (index / (history.length - 1)) * plotWidth);
  const toY = (value: number) =>
    topPadding + ((chartMax - value) / chartRange) * plotHeight;
  const linePath = history.reduce((path, point, index) => {
    const x = toX(index).toFixed(2);
    const y = toY(point.value).toFixed(2);
    if (index === 0) return `M ${x} ${y}`;
    if (mode === "step") {
      const previousY = toY(history[index - 1].value).toFixed(2);
      return `${path} L ${x} ${previousY} L ${x} ${y}`;
    }
    return `${path} L ${x} ${y}`;
  }, "");
  const areaPath = `${linePath} L ${toX(history.length - 1).toFixed(2)} ${(height - bottomPadding).toFixed(2)} L ${toX(0).toFixed(2)} ${(height - bottomPadding).toFixed(2)} Z`;
  const latest = history.at(-1)!;
  const latestX = toX(history.length - 1);
  const latestY = toY(latest.value);

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartValue}>
        <span>{latestLabel} {formatChartDate(latest.date)}</span>
        <strong>{formatRate(latest.value)}{suffix}</strong>
      </div>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>
        {[0, 0.5, 1].map((ratio) => {
          const y = topPadding + ratio * plotHeight;
          return <line key={ratio} className={styles.chartGrid} x1={horizontalPadding} x2={width - horizontalPadding} y1={y} y2={y} />;
        })}
        <path className={styles.chartArea} d={areaPath} />
        <path className={styles.chartLine} d={linePath} />
        {showAllPoints && history.map((point, index) => (
          <circle
            className={styles.chartPoint}
            cx={toX(index)}
            cy={toY(point.value)}
            r={index === history.length - 1 ? "3.5" : "2.3"}
            key={point.date}
          />
        ))}
        {!showAllPoints && (
          <circle className={styles.chartPoint} cx={latestX} cy={latestY} r="3.5" />
        )}
      </svg>
      {monthlyAxis ? (
        <div className={styles.chartMonths} aria-label="최근 12개월">
          {history.map((point) => (
            <span key={point.date}>{Number(point.date.slice(4, 6))}월</span>
          ))}
        </div>
      ) : (
        <div className={styles.chartDates}>
          <span>{formatChartDate(history[0].date)}</span>
          <span>{formatChartDate(latest.date)}</span>
        </div>
      )}
    </div>
  );
}

function findLatestRateChange(history: FinanceHistoryPoint[]) {
  for (let index = history.length - 1; index > 0; index--) {
    const current = history[index];
    const previous = history[index - 1];
    if (current.value !== previous.value) {
      return {
        date: current.date,
        previousValue: previous.value,
        value: current.value,
        delta: current.value - previous.value,
      };
    }
  }
  return null;
}

function toMonthlyHistory(history: FinanceHistoryPoint[]): FinanceHistoryPoint[] {
  const latestByMonth = new Map<string, FinanceHistoryPoint>();
  history.forEach((point) => latestByMonth.set(point.date.slice(0, 6), point));
  return [...latestByMonth.values()].slice(-12);
}

export function FinanceWidget({
  finance,
  loading,
  stale,
  missing = [],
  warnings = [],
  onRefresh,
}: FinanceWidgetProps) {
  const [selectedCurrency, setSelectedCurrency] = useState<"USD" | "JPY" | "EUR">("USD");
  const hasExchange = Boolean(finance?.exchangeRates.length);
  const hasInterest = Boolean(finance?.interestRates.length);
  const hasAnyData = hasExchange || hasInterest;
  const selectedExchange =
    finance?.exchangeRates.find((quote) => quote.code === selectedCurrency) ??
    finance?.exchangeRates[0];
  const interestRate = finance?.interestRates[0];
  const latestRateChange = interestRate
    ? findLatestRateChange(interestRate.history)
    : null;
  const monthlyRateHistory = interestRate
    ? toMonthlyHistory(interestRate.history)
    : [];

  return (
    <section className={styles.container} aria-label="환율 및 금리 정보">
      <div className={styles.header}>
        <div>
          <div className={styles.title}><UiIcon name="finance" size={18} />환율·금리</div>
          <div className={styles.subtitle}>공식 공공데이터 기준 정보</div>
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={onRefresh}
          disabled={loading}
          aria-label="환율과 금리 정보 새로고침"
        >
          {loading ? "조회 중…" : "↻ 갱신"}
        </button>
      </div>

      {loading && !hasAnyData ? (
        <div className={styles.loading}>공식 환율과 금리를 불러오고 있습니다…</div>
      ) : (
        <div className={styles.grid}>
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <span>환율</span>
              <span className={styles.baseDate}>{formatSourceDate(finance?.exchangeDate)}</span>
            </div>
            {hasExchange ? (
              <div className={styles.rateList}>
                {finance?.exchangeRates.map((quote) => (
                  <div className={styles.rateRow} key={quote.code}>
                    <div>
                      <strong>{quote.code}</strong>
                      <span>{quote.unit === 100 ? "100엔" : quote.label}</span>
                    </div>
                    <div className={styles.rateValue}>
                      {formatRate(quote.rate)} <small>원</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>한국은행 환율 데이터가 아직 없습니다.</div>
            )}
            {selectedExchange && (
              <div className={styles.trendSection}>
                <div className={styles.trendHeader}>
                  <span>최근 3개월 추이</span>
                  <div className={styles.currencyTabs} role="group" aria-label="환율 그래프 통화 선택">
                    {finance?.exchangeRates.map((quote) => (
                      <button
                        type="button"
                        key={quote.code}
                        className={quote.code === selectedExchange.code ? styles.currencyTabActive : styles.currencyTab}
                        onClick={() => setSelectedCurrency(quote.code)}
                        aria-pressed={quote.code === selectedExchange.code}
                      >
                        {quote.code}
                      </button>
                    ))}
                  </div>
                </div>
                <RateTrendChart
                  history={selectedExchange.history}
                  ariaLabel={`${selectedExchange.label} 최근 3개월 환율 추이`}
                  suffix="원"
                />
              </div>
            )}
            <div className={styles.source}>한국은행 ECOS · 매매기준율</div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <span>금리</span>
              <span className={styles.baseDate}>
                최근 관측 {formatSourceDate(interestRate?.baseDate)}
              </span>
            </div>
            {hasInterest ? (
              <div className={styles.interestBody}>
                <span>{interestRate?.label}</span>
                <strong>{formatRate(interestRate?.rate ?? 0)}%</strong>
                <small>연 기준</small>
              </div>
            ) : (
              <div className={styles.empty}>한국은행 기준금리 데이터가 아직 없습니다.</div>
            )}
            {latestRateChange && (
              <div className={styles.rateChangeSummary}>
                <span>최근 변경 {formatSourceDate(latestRateChange.date)}</span>
                <div>
                  <strong>
                    {formatRate(latestRateChange.previousValue)}% → {formatRate(latestRateChange.value)}%
                  </strong>
                  <em className={latestRateChange.delta > 0 ? styles.rateChangeUp : styles.rateChangeDown}>
                    {latestRateChange.delta > 0 ? "▲ +" : "▼ "}{formatRate(latestRateChange.delta)}%p
                  </em>
                </div>
              </div>
            )}
            {hasInterest && (
              <div className={styles.trendSection}>
                <div className={styles.trendHeader}>
                  <span>최근 1년 월별 추이 · 12개월</span>
                </div>
                <RateTrendChart
                  history={monthlyRateHistory}
                  ariaLabel="한국은행 기준금리 최근 1년 월별 추이 12개"
                  suffix="%"
                  mode="step"
                  latestLabel="최근 관측"
                  showAllPoints
                  monthlyAxis
                />
              </div>
            )}
            <div className={styles.source}>한국은행 ECOS · 공식 기준금리</div>
          </article>
        </div>
      )}

      {stale && <div className={styles.notice}>현재 조회가 지연되어 마지막 정상 데이터를 표시합니다.</div>}
      {missing.length > 0 && (
        <div className={styles.notice}>
          서버 환경 변수 {missing.join(", ")} 설정이 필요합니다.
        </div>
      )}
      {warnings.map((warning) => (
        <div className={styles.warning} key={warning}>{warning}</div>
      ))}
    </section>
  );
}
