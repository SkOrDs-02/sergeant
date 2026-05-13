/**
 * `/ai_cost` slash-command backend — realtime AI-spend rollup для founder-DM.
 *
 * Контекст: PR-12 (#2567) поклав per-Anthropic-call ledger у `ai_usage_daily`,
 * PR-13 (#2590) візуалізував його у Grafana. Цей модуль — runtime-aggregator
 * без походу у Prometheus: founder отримує TLDR у Telegram-DM без
 * необхідності відкривати дашборд.
 *
 * Архітектура:
 *   - DB-side aggregate (Anthropic): `ai_usage_daily WHERE subject_key='provider:anthropic'`
 *     дає за-Kyiv-добу per-model rollup. Day boundaries — Europe/Kyiv
 *     (Domain invariant, узгоджено з PR-12 `recordAnthropicUsageToDb`).
 *   - In-process Prom-counter snapshot (Voyage + endpoint top-3): Voyage не
 *     має DB-sink-у (PR-12 покрив тільки Anthropic), тому voyage-числа
 *     читаємо з `aiCostEstimateUsd` counter-у через `register.getSingleMetric`.
 *     Caveat: counter ресетиться при рестарті інстансу — додаємо footer у
 *     Markdown, щоб founder-а не вводити в оману.
 *
 * Fail-soft: усі queries обернені у try/catch. Часткова відсутність даних
 * (наприклад, voyage Prom-counter порожній) НЕ блокує решту відповіді —
 * команда залишається корисною навіть при partial failure.
 */

import type { Pool } from "pg";
import { register } from "../../obs/metrics.js";

// ─────────────────────────────────────────────────────────────────────────
// Public types — JSON shape повертається з `/api/internal/openclaw/ai-cost-summary`
// та споживається slash-command formatter-ом.
// ─────────────────────────────────────────────────────────────────────────

export interface ModelCostBreakdown {
  /** `claude-sonnet-4-...`, `claude-haiku-...`, etc (raw bucket suffix). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  estCostUsd: number;
}

export interface PeriodCostSummary {
  /** Inclusive ISO `YYYY-MM-DD` (Europe/Kyiv). */
  startDay: string;
  /** Inclusive ISO `YYYY-MM-DD` (Europe/Kyiv). */
  endDay: string;
  /** Розгалуження тільки по `anthropic:<model>`. */
  models: ReadonlyArray<ModelCostBreakdown>;
  totalCostUsd: number;
  totalTokens: number;
}

export interface BudgetSnapshot {
  /** `ANTHROPIC_MONTHLY_BUDGET_USD` (USD/month). 0 ⇒ не сконфігуровано. */
  anthropicMonthlyBudgetUsd: number;
  /** `VOYAGE_MONTHLY_BUDGET_USD` (USD/month). 0 ⇒ не сконфігуровано. */
  voyageMonthlyBudgetUsd: number;
}

export interface EndpointCostRow {
  provider: string;
  model: string;
  endpoint: string;
  estCostUsd: number;
}

export interface VoyageSnapshot {
  /**
   * Сума `ai_cost_estimate_usd_total{provider="voyage"}` по всіх labels
   * у поточному процесі. Це since-process-start cumulative (Prom-counter-
   * semantics), не «за період»; UI використовує його тільки як supplemental
   * прев'ю для founder-а.
   */
  cumulativeSinceRestartUsd: number;
}

export interface AiCostSummary {
  /** Момент генерації (UTC ISO). */
  generatedAt: string;
  /** День-сьогодні у Kyiv-форматі — використовується UI для day-of-month math. */
  todayKyiv: string;
  /** За-сьогодні (Kyiv). */
  today: PeriodCostSummary;
  /** Тиждень (Mon..Sun, ISO-week), що містить today. */
  week: PeriodCostSummary;
  /** Календарний місяць, що містить today (1..end-of-month). */
  month: PeriodCostSummary;
  /** Top-3 endpoints за in-process Prom-counter-ом (since process restart). */
  topEndpoints: ReadonlyArray<EndpointCostRow>;
  /** Voyage cumulative (since restart) — для довідки. */
  voyage: VoyageSnapshot;
  /** Бюджет із env-конфігу. */
  budget: BudgetSnapshot;
  /**
   * Run-rate (today_spent / day_of_month_so_far × days_in_month). 0 коли
   * day_of_month=1 і spent=0 — щоб projection не показував Infinity.
   */
  projection: {
    /** USD/доба середнього за поточний місяць (avg того, що вже витрачено). */
    avgDailySpendThisMonthUsd: number;
    /** USD/місяць — проста ((spent_so_far / day) × month_days)-екстраполяція. */
    eomProjectionUsd: number;
    /** Скільки днів місяця уже пройшло (today inclusive). */
    daysElapsedInMonth: number;
    /** Скільки днів у поточному календарному місяці. */
    daysInMonth: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Kyiv-date helpers
// ─────────────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` у Europe/Kyiv для переданого `now` (default — поточний час). */
export function kyivDayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

interface KyivYmd {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

function parseKyivDay(day: string): KyivYmd {
  const parts = day.split("-");
  if (parts.length !== 3) {
    throw new Error(`Invalid Kyiv day (expected YYYY-MM-DD): ${day}`);
  }
  return {
    year: Number(parts[0]),
    month: Number(parts[1]),
    day: Number(parts[2]),
  };
}

function formatKyivYmd({ year, month, day }: KyivYmd): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** UTC-noon shifted to Kyiv day — стабільний reference щоб уникати DST-edge-кейсів. */
function kyivDayToUtcDate(day: string): Date {
  const { year, month, day: dom } = parseKyivDay(day);
  // 12:00 UTC того ж дня гарантує, що Kyiv (UTC+2/+3) лишається на тому ж добу.
  return new Date(Date.UTC(year, month - 1, dom, 12, 0, 0));
}

/**
 * Понеділок ISO-тижня (week start) для переданого Kyiv-дня, як Kyiv-day.
 * Не залежить від host-локалі.
 */
export function kyivWeekStart(day: string): string {
  const date = kyivDayToUtcDate(day);
  // Mon=0..Sun=6 (ISO-week). `getUTCDay()` повертає Sun=0..Sat=6.
  const dowSun0 = date.getUTCDay();
  const isoOffset = (dowSun0 + 6) % 7; // 0=Mon, 6=Sun
  date.setUTCDate(date.getUTCDate() - isoOffset);
  return kyivDayKey(date);
}

/** Перший день календарного місяця, що містить переданий Kyiv-день. */
export function kyivMonthStart(day: string): string {
  const { year, month } = parseKyivDay(day);
  return formatKyivYmd({ year, month, day: 1 });
}

/** Останній день календарного місяця, що містить переданий Kyiv-день. */
export function kyivMonthEnd(day: string): string {
  const { year, month } = parseKyivDay(day);
  // JS: `new Date(year, month, 0)` = останній день попереднього місяця-+1.
  const last = new Date(Date.UTC(year, month, 0, 12));
  return kyivDayKey(last);
}

/** Кількість днів у календарному місяці, що містить переданий Kyiv-день. */
export function kyivDaysInMonth(day: string): number {
  const { year, month } = parseKyivDay(day);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ─────────────────────────────────────────────────────────────────────────
// DB query
// ─────────────────────────────────────────────────────────────────────────

const ANTHROPIC_BUCKET_PREFIX = "anthropic:";

interface AnthropicUsageRow {
  bucket: string;
  request_count: string | number;
  input_tokens: string | number;
  output_tokens: string | number;
  total_tokens: string | number;
  est_cost_usd: string | number;
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : 0;
}

function modelFromBucket(bucket: string): string {
  if (bucket.startsWith(ANTHROPIC_BUCKET_PREFIX)) {
    return bucket.slice(ANTHROPIC_BUCKET_PREFIX.length);
  }
  return bucket;
}

/**
 * Зчитує per-model aggregate за inclusive Kyiv-day range. Підсумовує
 * `ai_usage_daily` рядки із `subject_key='provider:anthropic'` і
 * `bucket LIKE 'anthropic:%'` (PR-12 invariant).
 */
export async function fetchAnthropicCostsForRange(
  pool: Pool,
  startDay: string,
  endDay: string,
): Promise<PeriodCostSummary> {
  const result = await pool.query<AnthropicUsageRow>(
    `SELECT bucket,
            SUM(request_count)::bigint AS request_count,
            SUM(input_tokens)::bigint  AS input_tokens,
            SUM(output_tokens)::bigint AS output_tokens,
            SUM(total_tokens)::bigint  AS total_tokens,
            SUM(est_cost_usd)::numeric AS est_cost_usd
       FROM ai_usage_daily
      WHERE subject_key = 'provider:anthropic'
        AND bucket LIKE 'anthropic:%'
        AND usage_day >= $1::date
        AND usage_day <= $2::date
      GROUP BY bucket
      ORDER BY est_cost_usd DESC`,
    [startDay, endDay],
  );
  const models: ModelCostBreakdown[] = result.rows.map((row) => ({
    model: modelFromBucket(row.bucket),
    requestCount: toNumber(row.request_count),
    inputTokens: toNumber(row.input_tokens),
    outputTokens: toNumber(row.output_tokens),
    totalTokens: toNumber(row.total_tokens),
    estCostUsd: toNumber(row.est_cost_usd),
  }));
  const totalCostUsd = models.reduce((acc, m) => acc + m.estCostUsd, 0);
  const totalTokens = models.reduce((acc, m) => acc + m.totalTokens, 0);
  return { startDay, endDay, models, totalCostUsd, totalTokens };
}

// ─────────────────────────────────────────────────────────────────────────
// In-process Prom-counter snapshot
// ─────────────────────────────────────────────────────────────────────────

interface CounterSample {
  value: number;
  labels: Record<string, string | number>;
}

interface CounterMetric {
  get(): Promise<{ values: ReadonlyArray<CounterSample> }>;
}

function asCounterMetric(metric: unknown): CounterMetric | null {
  if (
    metric &&
    typeof metric === "object" &&
    "get" in metric &&
    typeof (metric as { get: unknown }).get === "function"
  ) {
    return metric as CounterMetric;
  }
  return null;
}

/**
 * Top-N endpoints за `ai_cost_estimate_usd_total` (in-process counter).
 * Counter — since-process-start cumulative, тому числа можуть бути менші
 * за реальний «за місяць»; це supplemental прев'ю для founder-а.
 *
 * Fail-soft: missing counter / API helper-помилка → порожній масив.
 */
export async function fetchTopEndpointsFromProm(
  limit: number = 3,
): Promise<ReadonlyArray<EndpointCostRow>> {
  try {
    const metric = asCounterMetric(
      register.getSingleMetric("ai_cost_estimate_usd_total"),
    );
    if (!metric) return [];
    const snapshot = await metric.get();
    const rows: EndpointCostRow[] = snapshot.values
      .filter((s) => s.value > 0)
      .map((s) => ({
        provider: String(s.labels["provider"] ?? "unknown"),
        model: String(s.labels["model"] ?? "unknown"),
        endpoint: String(s.labels["endpoint"] ?? "unknown"),
        estCostUsd: s.value,
      }))
      .sort((a, b) => b.estCostUsd - a.estCostUsd)
      .slice(0, limit);
    return rows;
  } catch {
    return [];
  }
}

/**
 * Voyage cumulative (since process restart). У ledger-і (PR-12) Voyage не
 * пишеться, тому єдине джерело — Prom-counter. Caller обов'язково повинен
 * рендерити caveat у markdown («з моменту рестарту»).
 */
export async function fetchVoyageCumulativeFromProm(): Promise<VoyageSnapshot> {
  try {
    const metric = asCounterMetric(
      register.getSingleMetric("ai_cost_estimate_usd_total"),
    );
    if (!metric) return { cumulativeSinceRestartUsd: 0 };
    const snapshot = await metric.get();
    const total = snapshot.values
      .filter((s) => s.labels["provider"] === "voyage")
      .reduce((acc, s) => acc + (Number.isFinite(s.value) ? s.value : 0), 0);
    return { cumulativeSinceRestartUsd: total };
  } catch {
    return { cumulativeSinceRestartUsd: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Aggregator entrypoint
// ─────────────────────────────────────────────────────────────────────────

export interface BuildAiCostSummaryInput {
  pool: Pool;
  /** Inject-имо щоб тести могли заморозити час. */
  now?: Date;
  budget: BudgetSnapshot;
}

/**
 * Топ-рівневий aggregator. Кожна під-секція (today/week/month/voyage/topEndpoints)
 * — окремий fail-soft try-block; partial failures не зривають загальну відповідь.
 */
export async function buildAiCostSummary({
  pool,
  now = new Date(),
  budget,
}: BuildAiCostSummaryInput): Promise<AiCostSummary> {
  const todayKyiv = kyivDayKey(now);
  const weekStart = kyivWeekStart(todayKyiv);
  const monthStart = kyivMonthStart(todayKyiv);
  const monthEnd = kyivMonthEnd(todayKyiv);

  const empty: PeriodCostSummary = {
    startDay: todayKyiv,
    endDay: todayKyiv,
    models: [],
    totalCostUsd: 0,
    totalTokens: 0,
  };

  async function safeFetch(
    start: string,
    end: string,
  ): Promise<PeriodCostSummary> {
    try {
      return await fetchAnthropicCostsForRange(pool, start, end);
    } catch {
      return { ...empty, startDay: start, endDay: end };
    }
  }

  const [today, week, monthSoFar, topEndpoints, voyage] = await Promise.all([
    safeFetch(todayKyiv, todayKyiv),
    safeFetch(weekStart, todayKyiv),
    safeFetch(monthStart, todayKyiv),
    fetchTopEndpointsFromProm(3),
    fetchVoyageCumulativeFromProm(),
  ]);

  const { day: domToday } = parseKyivDay(todayKyiv);
  const daysInMonth = kyivDaysInMonth(todayKyiv);
  const daysElapsedInMonth = domToday;
  const avgDailySpendThisMonthUsd =
    daysElapsedInMonth > 0 ? monthSoFar.totalCostUsd / daysElapsedInMonth : 0;
  const eomProjectionUsd = avgDailySpendThisMonthUsd * daysInMonth;

  return {
    generatedAt: now.toISOString(),
    todayKyiv,
    today,
    week,
    month: { ...monthSoFar, endDay: monthEnd },
    topEndpoints,
    voyage,
    budget,
    projection: {
      avgDailySpendThisMonthUsd,
      eomProjectionUsd,
      daysElapsedInMonth,
      daysInMonth,
    },
  };
}

// Markdown formatter — живе у `tools/openclaw/src/openclaw/aiCostFormat.ts`,
// бо це wire-side renderer (Telegram-specific) і `tools/openclaw` НЕ
// залежить від `apps/server`. Серверу достатньо повернути JSON-payload.
