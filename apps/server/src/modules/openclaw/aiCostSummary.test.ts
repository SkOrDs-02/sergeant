/**
 * `/ai_cost` slash-command backend — aggregator coverage.
 *
 * Pure logic тестується без DB / Prometheus:
 *   - Kyiv-helper-и (day/week/month/days-in-month) — table-driven.
 *   - `fetchAnthropicCostsForRange` — мокаємо `pool.query`, перевіряємо
 *     SQL-форму + параметри + rows->aggregate.
 *   - `buildAiCostSummary` — повний end-to-end happy + fail-soft.
 *   - Prom-counter helpers — `register.getSingleMetric` через прямий
 *     інкремент counter-а у тестовому процесі.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildAiCostSummary,
  fetchAnthropicCostsForRange,
  fetchAnthropicDailyTrend,
  fetchTopEndpointsFromProm,
  fetchVoyageCumulativeFromProm,
  kyivDayKey,
  kyivDayMinus,
  kyivDaysInMonth,
  kyivMonthEnd,
  kyivMonthStart,
  kyivWeekStart,
  MAX_TREND_DAYS,
} from "./aiCostSummary.js";

function makePool(rows: unknown[] | (() => unknown[])) {
  const queryMock = vi.fn(async () => ({
    rows: typeof rows === "function" ? rows() : rows,
    rowCount: typeof rows === "function" ? rows().length : rows.length,
  }));
  return { pool: { query: queryMock } as never, queryMock };
}

describe("Kyiv date helpers", () => {
  it("kyivDayKey форматує YYYY-MM-DD у Europe/Kyiv", () => {
    // 2026-05-13 06:00 UTC = 2026-05-13 09:00 Kyiv → день 13
    const utcMorning = new Date(Date.parse("2026-05-13T06:00:00Z"));
    expect(kyivDayKey(utcMorning)).toBe("2026-05-13");
    // 2026-05-12 23:30 UTC = 2026-05-13 02:30 Kyiv → день 13 (Kyiv обігнав UTC)
    const utcLateNight = new Date(Date.parse("2026-05-12T23:30:00Z"));
    expect(kyivDayKey(utcLateNight)).toBe("2026-05-13");
  });

  it("kyivWeekStart повертає понеділок ISO-тижня (середа → понеділок)", () => {
    expect(kyivWeekStart("2026-05-13")).toBe("2026-05-11");
  });

  it("kyivWeekStart на понеділку повертає той самий день", () => {
    expect(kyivWeekStart("2026-05-11")).toBe("2026-05-11");
  });

  it("kyivWeekStart на неділю повертає попередній понеділок", () => {
    expect(kyivWeekStart("2026-05-17")).toBe("2026-05-11");
  });

  it("kyivMonthStart/End на середину місяця", () => {
    expect(kyivMonthStart("2026-05-13")).toBe("2026-05-01");
    expect(kyivMonthEnd("2026-05-13")).toBe("2026-05-31");
  });

  it("kyivMonthEnd враховує лютий високосного / звичайного року", () => {
    expect(kyivMonthEnd("2024-02-15")).toBe("2024-02-29"); // високосний
    expect(kyivMonthEnd("2025-02-15")).toBe("2025-02-28");
  });

  it("kyivDaysInMonth — 28/29/30/31", () => {
    expect(kyivDaysInMonth("2026-01-15")).toBe(31);
    expect(kyivDaysInMonth("2026-04-15")).toBe(30);
    expect(kyivDaysInMonth("2025-02-15")).toBe(28);
    expect(kyivDaysInMonth("2024-02-15")).toBe(29);
  });
});

describe("fetchAnthropicCostsForRange — SQL shape + aggregation", () => {
  it("формує coalesced SUM по моделях за inclusive Kyiv-day range", async () => {
    const { pool, queryMock } = makePool([
      {
        bucket: "anthropic:claude-sonnet-4-5",
        request_count: "12",
        input_tokens: "120000",
        output_tokens: "30000",
        total_tokens: "150000",
        est_cost_usd: "0.825",
      },
      {
        bucket: "anthropic:claude-haiku-3-5",
        request_count: "200",
        input_tokens: "400000",
        output_tokens: "60000",
        total_tokens: "460000",
        est_cost_usd: "0.124",
      },
    ]);

    const result = await fetchAnthropicCostsForRange(
      pool,
      "2026-05-01",
      "2026-05-13",
    );

    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0] as unknown as [string, unknown[]];
    const sql = call[0];
    const params = call[1];
    expect(sql).toMatch(/FROM ai_usage_daily/);
    expect(sql).toMatch(/subject_key = 'provider:anthropic'/);
    expect(sql).toMatch(/bucket LIKE 'anthropic:%'/);
    expect(sql).toMatch(/GROUP BY bucket/);
    expect(params).toEqual(["2026-05-01", "2026-05-13"]);

    expect(result.startDay).toBe("2026-05-01");
    expect(result.endDay).toBe("2026-05-13");
    expect(result.models).toHaveLength(2);
    expect(result.models[0]?.model).toBe("claude-sonnet-4-5");
    expect(result.models[0]?.estCostUsd).toBeCloseTo(0.825, 6);
    expect(result.models[1]?.model).toBe("claude-haiku-3-5");
    expect(result.totalCostUsd).toBeCloseTo(0.949, 6);
    expect(result.totalTokens).toBe(610_000);
  });

  it("повертає порожні нулі коли rows[]=[]", async () => {
    const { pool } = makePool([]);
    const result = await fetchAnthropicCostsForRange(
      pool,
      "2026-05-13",
      "2026-05-13",
    );
    expect(result.models).toEqual([]);
    expect(result.totalCostUsd).toBe(0);
    expect(result.totalTokens).toBe(0);
  });

  it("парсить числа-як-рядки (numeric→string у pg-драйвері)", async () => {
    const { pool } = makePool([
      {
        bucket: "anthropic:claude-opus-4",
        request_count: "1",
        input_tokens: "100",
        output_tokens: "50",
        total_tokens: "150",
        est_cost_usd: "1.500000",
      },
    ]);
    const result = await fetchAnthropicCostsForRange(
      pool,
      "2026-05-13",
      "2026-05-13",
    );
    expect(result.models[0]?.estCostUsd).toBe(1.5);
    expect(result.models[0]?.requestCount).toBe(1);
  });
});

describe("Prom counter snapshots — endpoint top-3 + Voyage", () => {
  beforeEach(async () => {
    // Скидаємо counter перед кожним тестом, щоб label-набори
    // попередніх тестів не «текли» сюди.
    const { register } = await import("../../obs/metrics.js");
    register.resetMetrics();
  });

  it("fetchTopEndpointsFromProm повертає top-N посортовано за USD", async () => {
    const { aiCostEstimateUsd } = await import("../../obs/metrics.js");
    aiCostEstimateUsd.inc(
      { provider: "anthropic", model: "claude-sonnet-4-5", endpoint: "chat" },
      0.5,
    );
    aiCostEstimateUsd.inc(
      { provider: "voyage", model: "voyage-3", endpoint: "embed" },
      0.1,
    );
    aiCostEstimateUsd.inc(
      { provider: "anthropic", model: "claude-haiku-3-5", endpoint: "coach" },
      0.3,
    );
    aiCostEstimateUsd.inc(
      {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        endpoint: "nutrition",
      },
      0.2,
    );

    const top = await fetchTopEndpointsFromProm(3);
    expect(top).toHaveLength(3);
    expect(top[0]?.endpoint).toBe("chat");
    expect(top[0]?.estCostUsd).toBeCloseTo(0.5, 6);
    expect(top[1]?.endpoint).toBe("coach");
    expect(top[2]?.endpoint).toBe("nutrition");
  });

  it("fetchTopEndpointsFromProm пропускає zero-value rows", async () => {
    const top = await fetchTopEndpointsFromProm(3);
    expect(top).toEqual([]);
  });

  it("fetchVoyageCumulativeFromProm агрегує по всіх voyage labels", async () => {
    const { aiCostEstimateUsd } = await import("../../obs/metrics.js");
    aiCostEstimateUsd.inc(
      { provider: "voyage", model: "voyage-3", endpoint: "embed" },
      0.05,
    );
    aiCostEstimateUsd.inc(
      { provider: "voyage", model: "voyage-3-lite", endpoint: "embed" },
      0.02,
    );
    aiCostEstimateUsd.inc(
      { provider: "anthropic", model: "claude-haiku-3-5", endpoint: "chat" },
      0.1,
    );

    const snapshot = await fetchVoyageCumulativeFromProm();
    expect(snapshot.cumulativeSinceRestartUsd).toBeCloseTo(0.07, 6);
  });
});

describe("buildAiCostSummary — end-to-end", () => {
  beforeEach(async () => {
    const { register } = await import("../../obs/metrics.js");
    register.resetMetrics();
  });

  it("збирає today/week/month + projection із 3 DB-fetch-ів", async () => {
    const todayRows = [
      {
        bucket: "anthropic:claude-sonnet-4-5",
        request_count: "5",
        input_tokens: "10000",
        output_tokens: "5000",
        total_tokens: "15000",
        est_cost_usd: "0.105",
      },
    ];
    const weekRows = [
      {
        bucket: "anthropic:claude-sonnet-4-5",
        request_count: "30",
        input_tokens: "70000",
        output_tokens: "30000",
        total_tokens: "100000",
        est_cost_usd: "0.66",
      },
    ];
    const monthRows = [
      {
        bucket: "anthropic:claude-sonnet-4-5",
        request_count: "100",
        input_tokens: "300000",
        output_tokens: "120000",
        total_tokens: "420000",
        est_cost_usd: "2.7",
      },
      {
        bucket: "anthropic:claude-haiku-3-5",
        request_count: "500",
        input_tokens: "800000",
        output_tokens: "100000",
        total_tokens: "900000",
        est_cost_usd: "0.34",
      },
    ];

    let call = 0;
    const queryMock = vi.fn(async () => {
      call += 1;
      if (call === 1) return { rows: todayRows, rowCount: todayRows.length };
      if (call === 2) return { rows: weekRows, rowCount: weekRows.length };
      return { rows: monthRows, rowCount: monthRows.length };
    });

    // 2026-05-13 09:00 Kyiv (06:00 UTC).
    const now = new Date(Date.parse("2026-05-13T06:00:00Z"));
    const result = await buildAiCostSummary({
      pool: { query: queryMock } as never,
      now,
      budget: {
        anthropicMonthlyBudgetUsd: 50,
        voyageMonthlyBudgetUsd: 10,
      },
    });

    expect(queryMock).toHaveBeenCalledTimes(3);
    expect(result.todayKyiv).toBe("2026-05-13");
    expect(result.today.totalCostUsd).toBeCloseTo(0.105, 6);
    expect(result.week.startDay).toBe("2026-05-11");
    expect(result.week.endDay).toBe("2026-05-13");
    expect(result.month.startDay).toBe("2026-05-01");
    expect(result.month.endDay).toBe("2026-05-31");
    expect(result.month.totalCostUsd).toBeCloseTo(3.04, 6);
    // 3.04 / 13 днів = 0.2338... avg
    expect(result.projection.avgDailySpendThisMonthUsd).toBeCloseTo(
      3.04 / 13,
      6,
    );
    // 0.2338... × 31 days
    expect(result.projection.eomProjectionUsd).toBeCloseTo((3.04 / 13) * 31, 6);
    expect(result.projection.daysElapsedInMonth).toBe(13);
    expect(result.projection.daysInMonth).toBe(31);
    expect(result.budget.anthropicMonthlyBudgetUsd).toBe(50);
  });

  it("fail-soft: коли pool.query кидає, period повертається порожнім", async () => {
    const queryMock = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const now = new Date(Date.parse("2026-05-13T06:00:00Z"));
    const result = await buildAiCostSummary({
      pool: { query: queryMock } as never,
      now,
      budget: { anthropicMonthlyBudgetUsd: 0, voyageMonthlyBudgetUsd: 0 },
    });
    expect(result.today.totalCostUsd).toBe(0);
    expect(result.week.totalCostUsd).toBe(0);
    expect(result.month.totalCostUsd).toBe(0);
    expect(result.topEndpoints).toEqual([]);
    expect(result.projection.eomProjectionUsd).toBe(0);
  });

  it("включає top-3 endpoints із Prom-counter-а", async () => {
    const { aiCostEstimateUsd } = await import("../../obs/metrics.js");
    aiCostEstimateUsd.inc(
      { provider: "anthropic", model: "claude-sonnet-4-5", endpoint: "chat" },
      0.5,
    );
    aiCostEstimateUsd.inc(
      { provider: "anthropic", model: "claude-haiku-3-5", endpoint: "coach" },
      0.2,
    );

    const queryMock = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const now = new Date(Date.parse("2026-05-13T06:00:00Z"));
    const result = await buildAiCostSummary({
      pool: { query: queryMock } as never,
      now,
      budget: { anthropicMonthlyBudgetUsd: 0, voyageMonthlyBudgetUsd: 0 },
    });
    expect(result.topEndpoints).toHaveLength(2);
    expect(result.topEndpoints[0]?.endpoint).toBe("chat");
  });
});

describe("kyivDayMinus", () => {
  it("вираховує (today − 6) → день тижня-тому", () => {
    expect(kyivDayMinus("2026-05-13", 6)).toBe("2026-05-07");
  });

  it("(today − 0) повертає той самий день", () => {
    expect(kyivDayMinus("2026-05-13", 0)).toBe("2026-05-13");
  });

  it("перехід через місячну границю (1-ше → попередній місяць)", () => {
    expect(kyivDayMinus("2026-05-01", 1)).toBe("2026-04-30");
    expect(kyivDayMinus("2026-03-01", 1)).toBe("2026-02-28");
    expect(kyivDayMinus("2024-03-01", 1)).toBe("2024-02-29"); // високосний
  });

  it("(today − 29) → 30-day window start", () => {
    expect(kyivDayMinus("2026-05-13", 29)).toBe("2026-04-14");
  });

  it("MAX_TREND_DAYS = 30 (sanity)", () => {
    expect(MAX_TREND_DAYS).toBe(30);
  });
});

describe("fetchAnthropicDailyTrend — SQL shape + zero-fill", () => {
  it("формує per-day GROUP BY usage_day + ORDER ASC", async () => {
    const { pool, queryMock } = makePool([
      {
        usage_day: "2026-05-11",
        request_count: "5",
        input_tokens: "10000",
        output_tokens: "3000",
        total_tokens: "13000",
        est_cost_usd: "0.105",
      },
      {
        usage_day: "2026-05-13",
        request_count: "12",
        input_tokens: "30000",
        output_tokens: "10000",
        total_tokens: "40000",
        est_cost_usd: "0.32",
      },
    ]);

    const result = await fetchAnthropicDailyTrend(
      pool,
      "2026-05-11",
      "2026-05-13",
    );
    expect(queryMock).toHaveBeenCalledTimes(1);
    const call = queryMock.mock.calls[0] as unknown as [string, unknown[]];
    const sql = call[0];
    const params = call[1];
    expect(sql).toMatch(/SUM\(est_cost_usd\)/);
    expect(sql).toMatch(/subject_key = 'provider:anthropic'/);
    expect(sql).toMatch(/bucket LIKE 'anthropic:%'/);
    expect(sql).toMatch(/GROUP BY usage_day/);
    expect(sql).toMatch(/ORDER BY usage_day ASC/);
    expect(params).toEqual(["2026-05-11", "2026-05-13"]);

    expect(result).toHaveLength(3);
    expect(result[0]?.day).toBe("2026-05-11");
    expect(result[0]?.totalCostUsd).toBeCloseTo(0.105, 6);
    // 2026-05-12 — gap, заповнюється нулями.
    expect(result[1]?.day).toBe("2026-05-12");
    expect(result[1]?.totalCostUsd).toBe(0);
    expect(result[1]?.requestCount).toBe(0);
    expect(result[1]?.totalTokens).toBe(0);
    expect(result[2]?.day).toBe("2026-05-13");
    expect(result[2]?.totalCostUsd).toBeCloseTo(0.32, 6);
  });

  it("парсить usage_day у вигляді Date-об'єкта (pg DATE driver)", async () => {
    const { pool } = makePool([
      {
        usage_day: new Date(Date.parse("2026-05-13T00:00:00Z")),
        request_count: "1",
        input_tokens: "100",
        output_tokens: "50",
        total_tokens: "150",
        est_cost_usd: "0.01",
      },
    ]);
    const result = await fetchAnthropicDailyTrend(
      pool,
      "2026-05-13",
      "2026-05-13",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.day).toBe("2026-05-13");
    expect(result[0]?.totalCostUsd).toBeCloseTo(0.01, 6);
  });

  it("пустий range → всі дні нульові (zero-fill, no rows)", async () => {
    const { pool } = makePool([]);
    const result = await fetchAnthropicDailyTrend(
      pool,
      "2026-05-07",
      "2026-05-13",
    );
    expect(result).toHaveLength(7);
    expect(result.every((p) => p.totalCostUsd === 0)).toBe(true);
    expect(result[0]?.day).toBe("2026-05-07");
    expect(result[6]?.day).toBe("2026-05-13");
  });
});

describe("buildAiCostSummary — trend block", () => {
  beforeEach(async () => {
    const { register } = await import("../../obs/metrics.js");
    register.resetMetrics();
  });

  it("без trendDays → trend property відсутня", async () => {
    const queryMock = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const now = new Date(Date.parse("2026-05-13T06:00:00Z"));
    const result = await buildAiCostSummary({
      pool: { query: queryMock } as never,
      now,
      budget: { anthropicMonthlyBudgetUsd: 0, voyageMonthlyBudgetUsd: 0 },
    });
    expect(result.trend).toBeUndefined();
  });

  it("trendDays=7 → fetch 4-й query (per-day trend), повертає points за range", async () => {
    // Послідовність queryMock: today, week, monthSoFar, trend.
    const todayRows: unknown[] = [];
    const weekRows: unknown[] = [];
    const monthRows: unknown[] = [];
    const trendRows = [
      {
        usage_day: "2026-05-09",
        request_count: "2",
        input_tokens: "5000",
        output_tokens: "1000",
        total_tokens: "6000",
        est_cost_usd: "0.04",
      },
      {
        usage_day: "2026-05-13",
        request_count: "10",
        input_tokens: "20000",
        output_tokens: "8000",
        total_tokens: "28000",
        est_cost_usd: "0.21",
      },
    ];
    let callCount = 0;
    const queryMock = vi.fn(async (sql: string) => {
      callCount += 1;
      // 4-та query — той що містить "GROUP BY usage_day".
      if (sql.includes("GROUP BY usage_day")) {
        return { rows: trendRows, rowCount: trendRows.length };
      }
      // інакше — за порядком: today, week, month
      const periodRows = [todayRows, weekRows, monthRows][callCount - 1] ?? [];
      return { rows: periodRows, rowCount: periodRows.length };
    });
    const now = new Date(Date.parse("2026-05-13T06:00:00Z"));
    const result = await buildAiCostSummary({
      pool: { query: queryMock } as never,
      now,
      budget: { anthropicMonthlyBudgetUsd: 50, voyageMonthlyBudgetUsd: 10 },
      trendDays: 7,
    });
    expect(queryMock).toHaveBeenCalledTimes(4);
    expect(result.trend).toBeDefined();
    expect(result.trend?.days).toBe(7);
    expect(result.trend?.startDay).toBe("2026-05-07");
    expect(result.trend?.endDay).toBe("2026-05-13");
    expect(result.trend?.points).toHaveLength(7);
    expect(result.trend?.totalCostUsd).toBeCloseTo(0.25, 6);
    expect(result.trend?.totalTokens).toBe(34_000);
    // 2026-05-09 — точка з DB; 2026-05-08 — zero-filled gap
    const may09 = result.trend?.points.find((p) => p.day === "2026-05-09");
    expect(may09?.totalCostUsd).toBeCloseTo(0.04, 6);
    const may08 = result.trend?.points.find((p) => p.day === "2026-05-08");
    expect(may08?.totalCostUsd).toBe(0);
  });

  it("trendDays > MAX_TREND_DAYS → clamp до MAX_TREND_DAYS", async () => {
    const queryMock = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const now = new Date(Date.parse("2026-05-13T06:00:00Z"));
    const result = await buildAiCostSummary({
      pool: { query: queryMock } as never,
      now,
      budget: { anthropicMonthlyBudgetUsd: 0, voyageMonthlyBudgetUsd: 0 },
      trendDays: 999,
    });
    expect(result.trend?.days).toBe(MAX_TREND_DAYS);
    expect(result.trend?.startDay).toBe("2026-04-14"); // 2026-05-13 − 29
    expect(result.trend?.endDay).toBe("2026-05-13");
    expect(result.trend?.points).toHaveLength(MAX_TREND_DAYS);
  });

  it("trendDays=0/негативний → clamp до 1 (single-day)", async () => {
    const queryMock = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const now = new Date(Date.parse("2026-05-13T06:00:00Z"));
    const result = await buildAiCostSummary({
      pool: { query: queryMock } as never,
      now,
      budget: { anthropicMonthlyBudgetUsd: 0, voyageMonthlyBudgetUsd: 0 },
      trendDays: 0,
    });
    expect(result.trend?.days).toBe(1);
    expect(result.trend?.startDay).toBe("2026-05-13");
    expect(result.trend?.endDay).toBe("2026-05-13");
    expect(result.trend?.points).toHaveLength(1);
  });

  it("fail-soft: trend query кидає → trend block з усіма нулями (не зриває весь reply)", async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes("GROUP BY usage_day")) {
        throw new Error("connection refused");
      }
      return { rows: [], rowCount: 0 };
    });
    const now = new Date(Date.parse("2026-05-13T06:00:00Z"));
    const result = await buildAiCostSummary({
      pool: { query: queryMock } as never,
      now,
      budget: { anthropicMonthlyBudgetUsd: 0, voyageMonthlyBudgetUsd: 0 },
      trendDays: 7,
    });
    expect(result.trend).toBeDefined();
    expect(result.trend?.points).toHaveLength(7);
    expect(result.trend?.totalCostUsd).toBe(0);
    expect(result.trend?.points.every((p) => p.totalCostUsd === 0)).toBe(true);
  });

  it("trendDays=NaN/Infinity → trend property відсутня (skip)", async () => {
    const queryMock = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const now = new Date(Date.parse("2026-05-13T06:00:00Z"));
    const resultNaN = await buildAiCostSummary({
      pool: { query: queryMock } as never,
      now,
      budget: { anthropicMonthlyBudgetUsd: 0, voyageMonthlyBudgetUsd: 0 },
      trendDays: Number.NaN,
    });
    expect(resultNaN.trend).toBeUndefined();
    const resultInf = await buildAiCostSummary({
      pool: { query: queryMock } as never,
      now,
      budget: { anthropicMonthlyBudgetUsd: 0, voyageMonthlyBudgetUsd: 0 },
      trendDays: Number.POSITIVE_INFINITY,
    });
    expect(resultInf.trend).toBeUndefined();
  });
});
