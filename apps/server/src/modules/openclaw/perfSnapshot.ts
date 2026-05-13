/**
 * `/perf` slash-command backend — server-side performance snapshot
 * для founder DM. Продовжує observability-cluster
 * (`/ai_cost` PR-26 #2706, `/alerts history` #2715, `/openclaw status` #2709).
 *
 * Контекст: дозволяє founder-у швидко перевірити server-side health
 * без походу у Grafana. Источник даних — winchy in-process
 * `prom-client` register (той самий register, що скрейпиться через
 * `/metrics`), тому жодних додаткових HTTP-походів у Prometheus
 * server-side не робимо.
 *
 * Важлива caveat: всі counter/histogram значення тут — **cumulative
 * since process restart**, не "last 5min". Реальна 5min-rate-формула
 * вимагає PromQL `rate(...[5m])` що неможливо обчислити з in-process
 * snapshot (потрібен time-series store). У Markdown-replay явно
 * рендеримо `uptime` секцію щоб founder-а не вводити в оману.
 *
 * Gauges (db_pool_*, ai_memory_ingest_queue_depth) — instant current
 * value, тому правдиві.
 *
 * Архітектура fail-soft: кожен section read обернений у try/catch;
 * partial failure не блокує решту відповіді.
 */

import { register } from "../../obs/metrics.js";

// ─────────────────────────────────────────────────────────────────────────
// Public types — wire shape for `/api/internal/openclaw/perf-snapshot`.
// ─────────────────────────────────────────────────────────────────────────

export interface RouteLatencySnapshot {
  /** HTTP method (GET/POST/...) + path (route, не raw URL). */
  method: string;
  path: string;
  /** Total observations у histogram-у з process-start. */
  count: number;
  /** Approx-percentiles у мілісекундах (bucket-quantile estimation). */
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface AiLatencySnapshot {
  /** `anthropic` / `voyage` / etc — labels з aiRequestDurationMs. */
  provider: string;
  count: number;
  p95Ms: number;
}

export interface DbPoolSnapshot {
  /** `pool.totalCount`. */
  total: number;
  /** `pool.idleCount`. */
  idle: number;
  /** `pool.waitingCount` — найважливіший gauge для saturation alarm. */
  waiting: number;
  /** Active = total - idle. Деривований для зручності UI. */
  active: number;
}

export interface QueueDepthSnapshot {
  /** `waiting`, `active`, `delayed`, `failed`. */
  status: string;
  depth: number;
}

export interface ErrorRouteSnapshot {
  method: string;
  path: string;
  statusClass: string;
  module: string;
  /** Cumulative since process restart. */
  count: number;
}

export interface PerfSnapshot {
  /** UTC ISO момент генерації. */
  generatedAt: string;
  /** Process uptime у секундах (для трактування cumulative counters). */
  uptimeSeconds: number;
  /** Top-N routes by total call count (since restart). */
  topHttpRoutes: ReadonlyArray<RouteLatencySnapshot>;
  /** Per-provider AI latency p95. */
  aiLatency: ReadonlyArray<AiLatencySnapshot>;
  /** Current pg pool state. */
  dbPool: DbPoolSnapshot | null;
  /** Current BullMQ queue depths by status. */
  aiMemoryQueue: ReadonlyArray<QueueDepthSnapshot>;
  /** Top-N routes by 4xx/5xx count (since restart). */
  topErrors: ReadonlyArray<ErrorRouteSnapshot>;
}

// ─────────────────────────────────────────────────────────────────────────
// Quantile estimation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Estimate p-quantile from a Prom-client histogram bucket-snapshot
 * via linear interpolation всередині the matched bucket.
 *
 * Buckets are `{ le: number, value: cumulativeCount }` (cumulative
 * monotonic-increasing). Returns `-Infinity` коли total=0.
 *
 * Edge cases:
 *   - Quantile точно потрапляє у last bucket (`+Inf`): повертаємо
 *     upper bound останнього **скінченного** bucket-у (ми не знаємо
 *     реальної верхньої границі).
 *   - Бакети ⌀-розкидані (count однаковий у двох сусідніх): обираємо
 *     перший, що покриває cumCount ≥ target.
 */
export function estimateQuantileFromBuckets(
  buckets: ReadonlyArray<{ le: number; cumCount: number }>,
  totalCount: number,
  quantile: number,
): number {
  if (totalCount <= 0 || buckets.length === 0) return Number.NEGATIVE_INFINITY;
  if (quantile <= 0) return buckets[0]?.le ?? 0;
  const target = totalCount * quantile;

  let prevLe = 0;
  let prevCum = 0;
  for (const b of buckets) {
    if (b.cumCount >= target) {
      // Linear interpolation in [prevLe, b.le].
      const bucketCount = b.cumCount - prevCum;
      if (bucketCount <= 0) return b.le;
      if (!Number.isFinite(b.le)) {
        // `+Inf` bucket — повертаємо upper-bound останнього
        // скінченного bucket-у. Якщо немає — повертаємо prevLe.
        return prevLe;
      }
      const fraction = (target - prevCum) / bucketCount;
      return prevLe + fraction * (b.le - prevLe);
    }
    prevLe = b.le;
    prevCum = b.cumCount;
  }
  // Усі бакети пройшли — взяли upper-bound останнього скінченного.
  const lastFinite = [...buckets]
    .reverse()
    .find((b) => Number.isFinite(b.le))?.le;
  return lastFinite ?? prevLe;
}

// ─────────────────────────────────────────────────────────────────────────
// Histogram readers
// ─────────────────────────────────────────────────────────────────────────

interface HistogramValue {
  metricName?: string;
  labels: Record<string, string | number>;
  value: number;
}

/**
 * Group histogram-`get().values` rows by per-row label-set, accumulating
 * `_bucket{le=...}`, `_count`, `_sum`. Returns map keyed by stable
 * stringified labels (sans `le`).
 */
function groupHistogramByLabels(values: ReadonlyArray<HistogramValue>): Map<
  string,
  {
    labels: Record<string, string>;
    buckets: Array<{ le: number; cumCount: number }>;
    count: number;
    sum: number;
  }
> {
  const out = new Map<
    string,
    {
      labels: Record<string, string>;
      buckets: Array<{ le: number; cumCount: number }>;
      count: number;
      sum: number;
    }
  >();

  for (const row of values) {
    const metricName = row.metricName ?? "";
    // У prom-client histogram-snapshot row.labels includes "le" only для
    // `_bucket` rows. `_count`/`_sum` rows shared labels-set.
    const labelEntries = Object.entries(row.labels)
      .filter(([k]) => k !== "le")
      .sort(([a], [b]) => a.localeCompare(b));
    const baseLabels = Object.fromEntries(
      labelEntries.map(([k, v]) => [k, String(v)]),
    );
    const groupKey = labelEntries
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(",");

    let group = out.get(groupKey);
    if (!group) {
      group = {
        labels: baseLabels,
        buckets: [],
        count: 0,
        sum: 0,
      };
      out.set(groupKey, group);
    }

    if (metricName.endsWith("_bucket")) {
      const leRaw = row.labels["le"];
      const le =
        leRaw === "+Inf"
          ? Number.POSITIVE_INFINITY
          : typeof leRaw === "number"
            ? leRaw
            : Number.parseFloat(String(leRaw));
      if (Number.isFinite(le) || le === Number.POSITIVE_INFINITY) {
        group.buckets.push({ le, cumCount: row.value });
      }
    } else if (metricName.endsWith("_count")) {
      group.count = row.value;
    } else if (metricName.endsWith("_sum")) {
      group.sum = row.value;
    }
  }

  for (const g of out.values()) {
    g.buckets.sort((a, b) => a.le - b.le);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Section readers (all fail-soft)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Top-N HTTP routes by total observation count, with p50/p95/p99
 * estimated from `http_request_duration_ms` histogram buckets.
 */
export async function fetchTopHttpRoutes(
  limit: number = 5,
): Promise<ReadonlyArray<RouteLatencySnapshot>> {
  try {
    const metric = register.getSingleMetric("http_request_duration_ms");
    if (!metric || !("get" in metric)) return [];
    const snapshot = (await (metric as { get(): Promise<unknown> }).get()) as {
      values: ReadonlyArray<HistogramValue>;
    };
    const groups = groupHistogramByLabels(snapshot.values);

    const aggregateByRoute = new Map<
      string,
      {
        method: string;
        path: string;
        count: number;
        buckets: Map<number, number>;
      }
    >();

    for (const g of groups.values()) {
      const method = String(g.labels["method"] ?? "");
      const path = String(g.labels["path"] ?? "");
      if (!method || !path) continue;
      const key = `${method} ${path}`;
      let agg = aggregateByRoute.get(key);
      if (!agg) {
        agg = { method, path, count: 0, buckets: new Map() };
        aggregateByRoute.set(key, agg);
      }
      agg.count += g.count;
      for (const b of g.buckets) {
        const prev = agg.buckets.get(b.le) ?? 0;
        agg.buckets.set(b.le, prev + b.cumCount);
      }
    }

    const rows: RouteLatencySnapshot[] = [];
    for (const agg of aggregateByRoute.values()) {
      if (agg.count <= 0) continue;
      const buckets = [...agg.buckets.entries()]
        .sort(([a], [b]) => a - b)
        .map(([le, cumCount]) => ({ le, cumCount }));
      rows.push({
        method: agg.method,
        path: agg.path,
        count: agg.count,
        p50Ms: estimateQuantileFromBuckets(buckets, agg.count, 0.5),
        p95Ms: estimateQuantileFromBuckets(buckets, agg.count, 0.95),
        p99Ms: estimateQuantileFromBuckets(buckets, agg.count, 0.99),
      });
    }

    return rows.sort((a, b) => b.count - a.count).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Per-provider AI latency p95 (from `ai_request_duration_ms`).
 */
export async function fetchAiLatency(): Promise<
  ReadonlyArray<AiLatencySnapshot>
> {
  try {
    const metric = register.getSingleMetric("ai_request_duration_ms");
    if (!metric || !("get" in metric)) return [];
    const snapshot = (await (metric as { get(): Promise<unknown> }).get()) as {
      values: ReadonlyArray<HistogramValue>;
    };
    const groups = groupHistogramByLabels(snapshot.values);

    const aggregateByProvider = new Map<
      string,
      { count: number; buckets: Map<number, number> }
    >();
    for (const g of groups.values()) {
      const provider = String(g.labels["provider"] ?? "");
      if (!provider) continue;
      let agg = aggregateByProvider.get(provider);
      if (!agg) {
        agg = { count: 0, buckets: new Map() };
        aggregateByProvider.set(provider, agg);
      }
      agg.count += g.count;
      for (const b of g.buckets) {
        const prev = agg.buckets.get(b.le) ?? 0;
        agg.buckets.set(b.le, prev + b.cumCount);
      }
    }

    const rows: AiLatencySnapshot[] = [];
    for (const [provider, agg] of aggregateByProvider.entries()) {
      if (agg.count <= 0) continue;
      const buckets = [...agg.buckets.entries()]
        .sort(([a], [b]) => a - b)
        .map(([le, cumCount]) => ({ le, cumCount }));
      rows.push({
        provider,
        count: agg.count,
        p95Ms: estimateQuantileFromBuckets(buckets, agg.count, 0.95),
      });
    }

    return rows.sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

interface GaugeValue {
  labels: Record<string, string | number>;
  value: number;
}

async function readGaugeFirstValue(name: string): Promise<number | null> {
  try {
    const metric = register.getSingleMetric(name);
    if (!metric || !("get" in metric)) return null;
    const snapshot = (await (metric as { get(): Promise<unknown> }).get()) as {
      values: ReadonlyArray<GaugeValue>;
    };
    const first = snapshot.values[0];
    if (!first || !Number.isFinite(first.value)) return null;
    return first.value;
  } catch {
    return null;
  }
}

/**
 * pg-pool snapshot via `db_pool_total/idle/waiting` gauges (PR-13 era).
 * Returns `null` коли metrics не зареєстровані (gracefully) —
 * formatter рендерить `—`.
 */
export async function fetchDbPool(): Promise<DbPoolSnapshot | null> {
  const [total, idle, waiting] = await Promise.all([
    readGaugeFirstValue("db_pool_total"),
    readGaugeFirstValue("db_pool_idle"),
    readGaugeFirstValue("db_pool_waiting"),
  ]);
  if (total === null && idle === null && waiting === null) return null;
  const safeTotal = total ?? 0;
  const safeIdle = idle ?? 0;
  return {
    total: safeTotal,
    idle: safeIdle,
    waiting: waiting ?? 0,
    active: Math.max(0, safeTotal - safeIdle),
  };
}

/**
 * AI memory BullMQ ingest queue depths per status label.
 */
export async function fetchAiMemoryQueue(): Promise<
  ReadonlyArray<QueueDepthSnapshot>
> {
  try {
    const metric = register.getSingleMetric("ai_memory_ingest_queue_depth");
    if (!metric || !("get" in metric)) return [];
    const snapshot = (await (metric as { get(): Promise<unknown> }).get()) as {
      values: ReadonlyArray<GaugeValue>;
    };
    return snapshot.values
      .filter((v) => Number.isFinite(v.value))
      .map((v) => ({
        status: String(v.labels["status"] ?? "unknown"),
        depth: v.value,
      }));
  } catch {
    return [];
  }
}

/**
 * Top-N HTTP routes by `http_errors_total` (4xx+5xx since process restart).
 */
export async function fetchTopErrors(
  limit: number = 5,
): Promise<ReadonlyArray<ErrorRouteSnapshot>> {
  try {
    const metric = register.getSingleMetric("http_errors_total");
    if (!metric || !("get" in metric)) return [];
    const snapshot = (await (metric as { get(): Promise<unknown> }).get()) as {
      values: ReadonlyArray<GaugeValue>;
    };
    return snapshot.values
      .filter((v) => Number.isFinite(v.value) && v.value > 0)
      .map((v) => ({
        method: String(v.labels["method"] ?? ""),
        path: String(v.labels["path"] ?? ""),
        statusClass: String(v.labels["status_class"] ?? ""),
        module: String(v.labels["module"] ?? ""),
        count: v.value,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * `process_uptime_seconds` from `collectDefaultMetrics` (prom-client default).
 * Fallback: `process.uptime()` із Node-у — гарантовано працює.
 */
async function fetchProcessUptimeSeconds(): Promise<number> {
  try {
    const metric = register.getSingleMetric("process_start_time_seconds");
    if (metric && "get" in metric) {
      const snapshot = (await (
        metric as { get(): Promise<unknown> }
      ).get()) as {
        values: ReadonlyArray<GaugeValue>;
      };
      const startTime = snapshot.values[0]?.value;
      if (Number.isFinite(startTime) && (startTime ?? 0) > 0) {
        return Math.max(0, Date.now() / 1000 - (startTime ?? 0));
      }
    }
  } catch {
    /* fall through to process.uptime() */
  }
  return process.uptime();
}

// ─────────────────────────────────────────────────────────────────────────
// Aggregator entrypoint
// ─────────────────────────────────────────────────────────────────────────

export interface BuildPerfSnapshotInput {
  /** Inject-имо щоб тести могли заморозити час. */
  now?: () => Date;
  /** Top-N для HTTP routes / errors. Default 5 за specom. */
  topRouteLimit?: number;
}

export async function buildPerfSnapshot(
  input: BuildPerfSnapshotInput = {},
): Promise<PerfSnapshot> {
  const now = input.now ?? (() => new Date());
  const topRouteLimit = input.topRouteLimit ?? 5;

  const [topHttpRoutes, aiLatency, dbPool, aiMemoryQueue, topErrors, uptime] =
    await Promise.all([
      fetchTopHttpRoutes(topRouteLimit),
      fetchAiLatency(),
      fetchDbPool(),
      fetchAiMemoryQueue(),
      fetchTopErrors(topRouteLimit),
      fetchProcessUptimeSeconds(),
    ]);

  return {
    generatedAt: now().toISOString(),
    uptimeSeconds: uptime,
    topHttpRoutes,
    aiLatency,
    dbPool,
    aiMemoryQueue,
    topErrors,
  };
}
