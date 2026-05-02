import type { Request, Response } from "express";
import client from "prom-client";
import type { Pool } from "pg";

/**
 * Prometheus-реєстр з default-метриками (event loop lag, RSS, heap, GC)
 * плюс HTTP-RED, Postgres-USE і domain-лічильники. Експортується через
 * `GET /metrics` (захищено bearer-токеном `METRICS_TOKEN`).
 */
export const register = new client.Registry();
client.collectDefaultMetrics({ register });

// ───────────────────────── HTTP (RED) ─────────────────────────
export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status", "module"],
  registers: [register],
});

export const httpRequestDurationMs = new client.Histogram({
  name: "http_request_duration_ms",
  help: "HTTP request duration in ms",
  labelNames: ["method", "path", "status_class"],
  buckets: [5, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [register],
});

// Дедикований лічильник 4xx/5xx по route: інкрементуємо тільки коли
// `status >= 400`, тож error-rate формулою стає
//   sum by (path) (rate(http_errors_total[5m]))
//   / sum by (path) (rate(http_request_duration_ms_count[5m]))
// без фільтра регексом по `status`. `module` лейбл із ALS потрібен, щоб
// алерти могли бути per-domain.
export const httpErrorsTotal = new client.Counter({
  name: "http_errors_total",
  help: "HTTP responses with status >= 400 by route",
  labelNames: ["method", "path", "status_class", "module"],
  registers: [register],
});

export const httpInFlight = new client.Gauge({
  name: "http_in_flight",
  help: "In-flight HTTP requests",
  labelNames: ["method"],
  registers: [register],
});

// ───────────────────────── Postgres (USE) ─────────────────────
export const dbQueryDurationMs = new client.Histogram({
  name: "db_query_duration_ms",
  help: "PG query duration in ms",
  labelNames: ["op"],
  buckets: [1, 5, 25, 100, 250, 1000, 5000],
  registers: [register],
});

export const dbErrorsTotal = new client.Counter({
  name: "db_errors_total",
  help: "PG errors grouped by error code",
  labelNames: ["code"],
  registers: [register],
});

export const dbSlowQueriesTotal = new client.Counter({
  name: "db_slow_queries_total",
  help: "PG queries over DB_SLOW_MS",
  labelNames: ["op"],
  registers: [register],
});

export const dbPoolTotal = new client.Gauge({
  name: "db_pool_total",
  help: "PG pool total connections",
  registers: [register],
});

export const dbPoolIdle = new client.Gauge({
  name: "db_pool_idle",
  help: "PG pool idle connections",
  registers: [register],
});

export const dbPoolWaiting = new client.Gauge({
  name: "db_pool_waiting",
  help: "PG pool waiting clients",
  registers: [register],
});

// ───────────────────────── Domain ─────────────────────────────
export const aiTokensTotal = new client.Counter({
  name: "ai_tokens_total",
  help: "AI tokens consumed",
  // endpoint=analyze-photo|refine-photo|chat|coach|day-plan|...
  // kind=prompt|completion|cache_write|cache_read
  labelNames: ["provider", "model", "endpoint", "kind"],
  registers: [register],
});

// Cost-attribution gauge для AI-викликів. Counter (а не Gauge), бо ми
// акумулюємо $-витрати по кожному endpoint × model. Per-endpoint breakdown
// потрібен щоб у Grafana (і в weekly cost-аудиті) видно було, котрий endpoint
// "з'їдає" бюджет — `chat` vs `coach` vs `analyze-photo`. Pricing-таблиця
// у `lib/anthropic.ts::ANTHROPIC_PRICING_USD_PER_MTOK`. На unknown-моделі
// counter не інкрементується (щоб не давати fake-нулі), тому сума `rate(...)`
// у Prometheus = «впевнена нижня межа» витрат.
export const aiCostEstimateUsd = new client.Counter({
  name: "ai_cost_estimate_usd_total",
  help: "Estimated AI provider cost in USD, accumulated per endpoint × model",
  labelNames: ["provider", "model", "endpoint"],
  registers: [register],
});

export const anthropicPromptCacheHitTotal = new client.Counter({
  name: "anthropic_prompt_cache_hit_total",
  help: "Anthropic prompt cache hit/miss per request",
  labelNames: ["version", "outcome"], // outcome=hit|miss
  registers: [register],
});

/**
 * Per-tool інвокейшнів-метрика (PR-12.C аудиту 2026-04-26).
 *
 * `tool` — ім'я Anthropic-tool-у (`delete_transaction`, `start_workout` тощо).
 * `outcome` — стадія life-cycle:
 *   - `proposed` — модель повернула `tool_use`-блок у першому кроці (клієнт
 *     ще не виконав; може й не виконати, якщо юзер скасує).
 *   - `executed` — клієнт надіслав `tool_result` у другому кроці, і його
 *     корелювали з відповідним `tool_use_id` із `tool_calls_raw`.
 *   - `unknown_tool` — `tool_use_id` із `tool_results` не змапився на
 *     жодне ім'я в `tool_calls_raw` (порушення контракту клієнт↔сервер).
 *
 * SLO/dashboards: `proposed - executed` дає кількість запропонованих, але
 * не виконаних tool-call-ів (юзер скасував / клієнт впав посеред виконання).
 */
export const chatToolInvocationsTotal = new client.Counter({
  name: "chat_tool_invocations_total",
  help: "Anthropic tool invocations per tool name and lifecycle outcome",
  labelNames: ["tool", "outcome"], // outcome=proposed|executed|unknown_tool
  registers: [register],
});

export const chatToolResultTruncatedTotal = new client.Counter({
  name: "chat_tool_result_truncated_total",
  help: "tool_result content truncated server-side before Anthropic call",
  labelNames: ["reason"], // reason=size_threshold
  registers: [register],
});

export const aiQuotaBlocksTotal = new client.Counter({
  name: "ai_quota_blocks_total",
  help: "AI quota refusals",
  labelNames: ["reason"], // limit|disabled
  registers: [register],
});

export const aiQuotaFailOpenTotal = new client.Counter({
  name: "ai_quota_fail_open_total",
  help: "AI quota store unavailable → fail-open",
  labelNames: ["reason"],
  registers: [register],
});

export const syncConflictsTotal = new client.Counter({
  name: "sync_conflicts_total",
  help: "Sync conflicts per module",
  labelNames: ["module"],
  registers: [register],
});

export const pushSendsTotal = new client.Counter({
  name: "push_sends_total",
  help: "Web-push send outcomes",
  labelNames: ["outcome"], // ok|invalid_endpoint|rate_limited|error
  registers: [register],
});

export const barcodeLookupsTotal = new client.Counter({
  name: "barcode_lookups_total",
  help: "Barcode lookups by upstream and outcome",
  labelNames: ["source", "outcome"], // source=off|usda|upcitemdb; outcome=hit|miss|error
  registers: [register],
});

export const externalHttpRequestsTotal = new client.Counter({
  name: "external_http_requests_total",
  help: "Outbound HTTP calls to 3rd-party APIs",
  labelNames: ["upstream", "outcome"], // upstream=monobank|privat|anthropic|off|usda|upcitemdb...
  registers: [register],
});

export const externalHttpDurationMs = new client.Histogram({
  name: "external_http_duration_ms",
  help: "Outbound HTTP call duration by upstream",
  labelNames: ["upstream", "outcome"], // outcome=ok|rate_limited|error|timeout|miss|hit
  buckets: [25, 100, 250, 500, 1000, 2500, 5000, 10000, 20000],
  registers: [register],
});

// ───────────────────────── Auth ───────────────────────────────
export const authAttemptsTotal = new client.Counter({
  name: "auth_attempts_total",
  help: "Auth attempts by operation and outcome",
  // op=sign_in|sign_up|forget_password|reset_password|session_check|signout
  // outcome=ok|bad_credentials|rate_limited|invalid|error|hit|miss
  labelNames: ["op", "outcome"],
  registers: [register],
});

export const authSessionLookupDurationMs = new client.Histogram({
  name: "auth_session_lookup_duration_ms",
  help: "Duration of better-auth session resolution in ms",
  labelNames: ["outcome"], // hit|miss|error
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
  registers: [register],
});

// ───────────────────────── Rate limit ─────────────────────────
export const rateLimitHitsTotal = new client.Counter({
  name: "rate_limit_hits_total",
  help: "Rate limit decisions by key and outcome",
  labelNames: ["key", "outcome"], // outcome=allowed|blocked
  registers: [register],
});

// ───────────────────────── Circuit Breaker ────────────────────
export const circuitBreakerState = new client.Gauge({
  name: "circuit_breaker_state",
  help: "Circuit breaker state (0=closed, 1=open, 2=half-open)",
  labelNames: ["name"], // name=anthropic|external_api|...
  registers: [register],
});

export const circuitBreakerTripsTotal = new client.Counter({
  name: "circuit_breaker_trips_total",
  help: "Circuit breaker state transitions",
  labelNames: ["name", "from", "to"], // from/to=closed|open|half-open
  registers: [register],
});

// ───────────────────────── Sync ───────────────────────────────
export const syncOperationsTotal = new client.Counter({
  name: "sync_operations_total",
  help: "Sync push/pull operations by module and outcome",
  // op=push|pull|push_all|pull_all; outcome=ok|conflict|unauthorized|invalid|too_large|error|empty
  labelNames: ["op", "module", "outcome"],
  registers: [register],
});

export const syncDurationMs = new client.Histogram({
  name: "sync_duration_ms",
  help: "Sync operation duration in ms",
  labelNames: ["op", "module"],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [register],
});

export const syncPayloadBytes = new client.Histogram({
  name: "sync_payload_bytes",
  help: "Sync blob size in bytes",
  labelNames: ["op", "module"],
  // 1KB..5MB — MAX_BLOB_SIZE = 5MB
  buckets: [1024, 8192, 65536, 262144, 1048576, 3145728, 5242880],
  registers: [register],
});

// ───────────────────────── Application errors ─────────────────
export const appErrorsTotal = new client.Counter({
  name: "app_errors_total",
  help: "Application errors surfaced by errorHandler",
  // kind=operational|programmer; status=400..599; code=VALIDATION|UNAUTHORIZED|...
  labelNames: ["kind", "status", "code", "module"],
  registers: [register],
});

export const unhandledRejectionsTotal = new client.Counter({
  name: "unhandled_rejections_total",
  help: "Process-level unhandled promise rejections",
  registers: [register],
});

export const uncaughtExceptionsTotal = new client.Counter({
  name: "uncaught_exceptions_total",
  help: "Process-level uncaught exceptions",
  registers: [register],
});

// ───────────────────────── AI ─────────────────────────────────
export const aiRequestsTotal = new client.Counter({
  name: "ai_requests_total",
  help: "AI requests by provider/model/endpoint/outcome",
  // endpoint=analyze-photo|refine-photo|chat|coach|day-plan|...
  // outcome=ok|rate_limited|timeout|error|bad_response
  labelNames: ["provider", "model", "endpoint", "outcome"],
  registers: [register],
});

export const aiRequestDurationMs = new client.Histogram({
  name: "ai_request_duration_ms",
  help: "AI request duration in ms",
  // outcome=ok|rate_limited|timeout|error|bad_response — дзеркалить
  // `aiRequestsTotal`, щоб у Grafana можна було обчислити p95 latency окремо
  // для error-шляхів (раніше latency error-шляху "розбавляла" ok-латенцію).
  labelNames: ["provider", "model", "endpoint", "outcome"],
  buckets: [100, 250, 500, 1000, 2500, 5000, 10000, 20000, 30000, 60000],
  registers: [register],
});

// ───────────────────────── Frontend web-vitals ────────────────
// LCP/INP/FCP/TTFB — таймінгові метрики в мілісекундах. Рейтинг обчислюється
// клієнтом за порогами `web-vitals` package (Google Core Web Vitals):
//   LCP: ≤2500 good, ≤4000 needs, >4000 poor
//   INP: ≤200 good, ≤500 needs, >500 poor
//   FCP: ≤1800 good, ≤3000 needs, >3000 poor
//   TTFB: ≤800 good, ≤1800 needs, >1800 poor
// Label `rating` тримаємо на сервері (замість обчислення з histogram quantile)
// щоб простий PromQL `sum by (rating) (rate(...))` давав readout "скільки
// поганих сесій" без додаткової математики. Cardinality обмежена: 4 метрики ×
// 3 рейтинги = 12 серій.
export const webVitalsDurationMs = new client.Histogram({
  name: "web_vitals_duration_ms",
  help: "Frontend Core Web Vitals (timing) reported from browsers",
  labelNames: ["metric", "rating"], // metric=LCP|INP|FCP|TTFB
  buckets: [50, 100, 250, 500, 800, 1200, 1800, 2500, 4000, 6000, 10000],
  registers: [register],
});

// CLS — безрозмірний, типово 0..0.5+ (0.1 good, 0.25 poor). Зберігаємо як
// float (не множимо ×1000) — бакети підібрані під CWV пороги.
export const webVitalsCls = new client.Histogram({
  name: "web_vitals_cls",
  help: "Frontend Cumulative Layout Shift reported from browsers (unitless)",
  labelNames: ["rating"],
  buckets: [0.01, 0.05, 0.1, 0.15, 0.25, 0.5, 1],
  registers: [register],
});

// ───────────────────────── Build info ─────────────────────────
// Const-`1` gauge with version/commit/release/env labels — the standard
// Prometheus pattern for shipping immutable build metadata. Two reasons we
// want it as a label-rich gauge instead of a plain log line at boot:
//
//   1. Dashboards can join `app_build_info` against any other series via
//      `* on (instance) group_left(version, commit) <metric>` to attribute
//      latency/error spikes to a specific deploy without re-tagging every
//      counter.
//   2. Alertmanager can include `{{ $labels.commit }}` in pages without
//      having to hit Sentry / Railway. Cardinality stays at 1 series per
//      pod (labels are constant for the process lifetime).
//
// Sources are read at module load (process.env is frozen for our purposes
// after dotenv-flow). `RAILWAY_GIT_COMMIT_SHA` is injected by Railway on
// every build; `SENTRY_RELEASE` is the canonical release tag if both
// Sentry-cli and Railway are present (Sentry-cli takes precedence). Empty
// strings collapse to `"unknown"` so PromQL queries never see an empty
// label value (which Prometheus treats as label absence — breaks joins).
export const appBuildInfo = new client.Gauge({
  name: "app_build_info",
  help: "Static gauge=1 with build/release metadata for join-on-labels in dashboards",
  labelNames: ["version", "commit", "release", "env", "node_version"],
  registers: [register],
});

appBuildInfo
  .labels({
    version: process.env.npm_package_version || "unknown",
    commit: (
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.GIT_COMMIT ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "unknown"
    ).slice(0, 12),
    release:
      process.env.SENTRY_RELEASE ||
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      "unknown",
    env: process.env.NODE_ENV || "development",
    node_version: process.version,
  })
  .set(1);

// ───────────────────────── Mono webhook ───────────────────────
export const monoWebhookReceivedTotal = new client.Counter({
  name: "mono_webhook_received_total",
  help: "Monobank webhook deliveries by outcome",
  labelNames: ["status"], // ok|invalid_secret|bad_payload|error
  registers: [register],
});

export const monoWebhookDurationMs = new client.Histogram({
  name: "mono_webhook_duration_ms",
  help: "Monobank webhook handler duration in ms",
  labelNames: ["status"],
  buckets: [1, 5, 25, 50, 100, 250, 500, 1000],
  registers: [register],
});

// ───────────────────────── Mono enrichment worker ─────────────
// Polling-worker для `mono_ai_enrichment_queue`. Раніше outbox-таблиця
// існувала (міграція 013), але жоден консьюмер її не читав — n8n flow
// `06-mono-webhook-enrichment.json` слухав окремий webhook, не БД.
// Метрики мінімальні (4 серії), щоб мати зір на:
//   * затримку enrichment-у (pending count = depth черги),
//   * пропускну здатність (processed_total{outcome=ok|failed}),
//   * latency на одну транзакцію.
export const monoEnrichmentQueueDepth = new client.Gauge({
  name: "mono_enrichment_queue_depth",
  help: "mono_ai_enrichment_queue rows by status",
  labelNames: ["status"], // pending|processing|done|failed
  registers: [register],
});

export const monoEnrichmentProcessedTotal = new client.Counter({
  name: "mono_enrichment_processed_total",
  help: "Mono AI enrichment outcomes",
  labelNames: ["outcome"], // ok|failed|skipped|missing_tx
  registers: [register],
});

export const monoEnrichmentDurationMs = new client.Histogram({
  name: "mono_enrichment_duration_ms",
  help: "Per-transaction enrichment duration (ms): DB → Anthropic → write-back",
  labelNames: ["outcome"], // ok|failed
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000],
  registers: [register],
});

// ───────────────────────── Auth-mail jobs (BullMQ) ────────────
export const authMailJobsEnqueuedTotal = new client.Counter({
  name: "auth_mail_jobs_enqueued_total",
  help: "Auth transactional mail enqueue attempts by mode",
  labelNames: ["mode"], // queued|fallback|enqueue_error
  registers: [register],
});

export const authMailJobsProcessedTotal = new client.Counter({
  name: "auth_mail_jobs_processed_total",
  help: "Auth transactional mail processor outcomes",
  labelNames: ["outcome"], // ok|retry|permanent_fail
  registers: [register],
});

export const authMailJobDurationMs = new client.Histogram({
  name: "auth_mail_job_duration_ms",
  help: "Auth transactional mail per-job duration (ms)",
  labelNames: ["outcome"], // ok|retry|permanent_fail
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000],
  registers: [register],
});

export const authMailQueueDepth = new client.Gauge({
  name: "auth_mail_queue_depth",
  help: "BullMQ auth-mail queue depth by status",
  labelNames: ["status"], // waiting|active|delayed|failed
  registers: [register],
});

// ───────────────── AI memory ingestion (BullMQ) ───────────────
// Лічильники для PR2-черги `ai-memory-ingest` (Redis-keys під префіксом
// `sergeant:`). Дзеркалять
// auth-mail-набір (enqueue / process / depth + duration), але з
// додатковим лейблом `source`, щоб алерти могли біти по конкретному
// домену (наприклад, finyk-spike при back-fill-і Monobank).
export const aiMemoryIngestEnqueuedTotal = new client.Counter({
  name: "ai_memory_ingest_enqueued_total",
  help: "AI memory ingest enqueue attempts by mode and source",
  labelNames: ["mode", "source"], // mode: queued|fallback|enqueue_error|disabled
  registers: [register],
});

export const aiMemoryIngestProcessedTotal = new client.Counter({
  name: "ai_memory_ingest_processed_total",
  help: "AI memory ingest job outcomes",
  labelNames: ["outcome", "source"], // outcome: ok|retry|permanent_fail|skipped
  registers: [register],
});

export const aiMemoryIngestDurationMs = new client.Histogram({
  name: "ai_memory_ingest_duration_ms",
  help: "AI memory ingest per-job duration (ms)",
  labelNames: ["outcome", "source"],
  // Voyage embed-and-upsert ~300–500мс типово; bucket-и розтягнуті, бо
  // у retry-сценарії duration може охопити timeout (`VOYAGE_TIMEOUT_MS`).
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000],
  registers: [register],
});

export const aiMemoryIngestQueueDepth = new client.Gauge({
  name: "ai_memory_ingest_queue_depth",
  help: "BullMQ AI memory ingest queue depth by status",
  labelNames: ["status"], // waiting|active|delayed|failed
  registers: [register],
});

// ───────────────────────── Helpers ────────────────────────────
export type StatusClass = "5xx" | "4xx" | "3xx" | "2xx" | "other";

/** Класифікує HTTP-статус у одне з 4 відер для SLO / latency-дашбордів. */
export function statusClass(status: number | string | undefined): StatusClass {
  const s = Number(status) || 0;
  if (s >= 500) return "5xx";
  if (s >= 400) return "4xx";
  if (s >= 300) return "3xx";
  if (s >= 200) return "2xx";
  return "other";
}

export interface PoolSamplerOptions {
  intervalMs?: number;
}

/**
 * Sample pg pool gauges periodically. Call once at boot.
 * Returns an unref-ed interval handle so the process can still exit cleanly.
 */
export function startPoolSampler(
  pool: Pool,
  { intervalMs = 10_000 }: PoolSamplerOptions = {},
): NodeJS.Timeout {
  const sample = () => {
    try {
      dbPoolTotal.set(pool.totalCount ?? 0);
      dbPoolIdle.set(pool.idleCount ?? 0);
      dbPoolWaiting.set(pool.waitingCount ?? 0);
    } catch {
      /* ignore */
    }
  };
  sample();
  const h = setInterval(sample, intervalMs);
  if (typeof h.unref === "function") h.unref();
  return h;
}

/**
 * Express handler для `GET /metrics`. Якщо задано `METRICS_TOKEN` — вимагає
 * `Authorization: Bearer <token>`. У dev/локально можна не ставити токен.
 */
export function metricsHandler(req: Request, res: Response): void {
  const expected = process.env.METRICS_TOKEN;
  if (expected) {
    const auth = req.get("authorization") || "";
    const got = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (got !== expected) {
      res.status(401).type("text/plain").send("unauthorized");
      return;
    }
  }
  register
    .metrics()
    .then((body) => {
      res.setHeader("Content-Type", register.contentType);
      res.send(body);
    })
    .catch((err: unknown) => {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : String(err);
      res.status(500).type("text/plain").send(`metrics_error: ${msg}`);
    });
}
