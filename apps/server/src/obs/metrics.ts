import client from "prom-client";

// Registry, DB-pool gauges, build-info, and helpers live in `./metrics/registry.js`.
// HTTP/DB-query/domain metric families live in `./metrics/{http,db-query,domain}.js`;
// sync + BullMQ-job metrics in `./metrics/{sync,jobs}.js`.
// The public import path `../obs/metrics.js` is preserved via the re-exports below.
import { register } from "./metrics/registry.js";

export {
  httpRequestsTotal,
  httpRequestDurationMs,
  httpErrorsTotal,
  httpInFlight,
} from "./metrics/http.js";
export {
  dbQueryDurationMs,
  dbErrorsTotal,
  dbSlowQueriesTotal,
  securityRoomUnreachableTotal,
} from "./metrics/db-query.js";
export {
  aiTokensTotal,
  aiCostEstimateUsd,
  infraMonthlyCostUsd,
  voyageDailyBudgetUsd,
  anthropicPromptCacheHitTotal,
  chatToolInvocationsTotal,
  chatToolResultTruncatedTotal,
  chatToolIterationCapHitTotal,
  nutritionPhotoRejectedTotal,
  chatPromptInjectionAttemptTotal,
  aiQuotaBlocksTotal,
  aiCostConsumedTotal,
  aiQuotaFailOpenTotal,
  aiQuotaCircuitOpenTotal,
  transcribeUsdCapEventsTotal,
  syncConflictsTotal,
  pushSendsTotal,
  barcodeLookupsTotal,
  externalHttpRequestsTotal,
  externalHttpDurationMs,
} from "./metrics/domain.js";

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

/**
 * M13 — session-lookup failures observed inside `requireSession*`
 * middleware (i.e. `getSessionUser` threw, not just "no session").
 *
 * `variant`: `require` | `require_soft` — which middleware caught.
 * `mode`:    `soft_swallowed` (early per-request failure, mapped to 401)
 *          | `loud_503` (consecutive failures crossed the circuit-breaker
 *            threshold, surfaced to the client as 503 instead of 401).
 *
 * Soft-swallowed failures historically masked real outages because clients
 * (notably the push service-worker) saw them as "you are not signed in"
 * and retried forever. The circuit-breaker re-emits them as 503 once they
 * become persistent so dashboards / alerts can fire.
 *
 * See `docs/security/hardening/M13-require-session-soft-loud-fail.md`.
 */
export const authSessionLookupFailureTotal = new client.Counter({
  name: "auth_session_lookup_failure_total",
  help: "Session-lookup failures inside requireSession*: getSessionUser threw rather than returning null",
  labelNames: ["variant", "mode"],
  registers: [register],
});

/**
 * H4 — кількість прочитань `account.{accessToken,refreshToken,idToken}`
 * row-ів, чий ciphertext був зашифрований не поточною версією ключа
 * (тобто потребує re-encrypt-у на наступному OAuth-refresh-і). Дозволяє
 * під час rotation moніторити `сума(stale) → 0` перед тим, як прибрати
 * старий ключ із `BETTER_AUTH_TOKEN_ENC_KEYS`.
 */
export const authTokenLazyReencryptTotal = new client.Counter({
  name: "auth_token_lazy_reencrypt_total",
  help: "Reads of OAuth token rows still encrypted under a non-current key version (H4 rotation gauge)",
  // field=accessToken|refreshToken|idToken; row_version=stringified key version
  labelNames: ["field", "row_version"],
  registers: [register],
});

// ───────────────────────── Rate limit ─────────────────────────
export const rateLimitHitsTotal = new client.Counter({
  name: "rate_limit_hits_total",
  help: "Rate limit decisions by key and outcome",
  labelNames: ["key", "outcome"], // outcome=allowed|blocked
  registers: [register],
});

/**
 * Total cost (token-equivalents) consumed by accepted requests, summed
 * per rate-limit `key`. The default cost is 1, so for routes without a
 * `cost(req)` override this counter advances 1-for-1 with
 * `rate_limit_hits_total{outcome="allowed"}`. For heavy AI routes
 * (`api:chat`, `nutrition:analyze-photo`, …) the counter advances by the
 * configured cost so dashboards see the actual budget burn.
 *
 * Prometheus query for the diagnostic's `rate_limit_p95_consumed_per_user`
 * intent (per-user p95 cost over a 5-minute window):
 *
 *   histogram_quantile(0.95,
 *     sum by (le, key) (
 *       rate(rate_limit_cost_total[5m])
 *     )
 *   )
 *
 * (User-level dimension comes from the `subject` baked into the bucket
 * key on the application side; surfacing it as a Prom label would
 * cardinality-explode the series.)
 */
export const rateLimitCostTotal = new client.Counter({
  name: "rate_limit_cost_total",
  help: "Total rate-limit cost (token-equivalents) consumed by accepted requests, by key. Default 1 per call; AI streams configure higher costs via RateLimitOptions.cost.",
  labelNames: ["key"],
  registers: [register],
});

/**
 * Counts how often the rate-limit middleware was forced into degraded
 * mode (both Redis AND Postgres unreachable, leaving only the per-process
 * in-memory bucket). `mode` records what the middleware did from there:
 *   - `inmem`  — `failMode === "open"`: served via in-memory bucket
 *     (per-replica, NOT global — sustained `inmem` on multi-replica deploys
 *     means the effective limit is `N×limit`).
 *   - `closed` — `failMode === "closed"`: refused with 503 because the
 *     route was tagged security-sensitive (e.g. `/api/auth/*`).
 *
 * Alert when `rate(rate_limit_degraded_total{mode="inmem"}[5m]) > 0`
 * sustained — a degraded production limiter is **always** an obs event,
 * not a steady-state.
 */
export const rateLimitDegradedTotal = new client.Counter({
  name: "rate_limit_degraded_total",
  help: "Rate-limit middleware fell through to in-memory or refused (503) because Redis+Postgres were unavailable",
  labelNames: ["key", "mode"], // mode=inmem|closed
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

// PR-24: per-LLMProvider invocation counter. Окремо від `ai_requests_total`,
// бо той вимагає `model`/`endpoint`/`outcome` labels від raw Anthropic-шляху,
// а тут трекаємо саме provider-abstraction-шар: який provider пішов на call
// і чи завершився ok. Endpoint-tag допомагає окремо рахувати classify-шлях
// (PR-24) і weekly-digest (PR-25).
// outcome=ok|error|missing_api_key|rate_limited|timeout
export const llmProviderInvocationsTotal = new client.Counter({
  name: "llm_provider_invocations_total",
  help: "LLMProvider abstraction invocations by provider / endpoint / outcome",
  labelNames: ["provider", "endpoint", "outcome"],
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

// CSP-violation reports posted by browsers to /api/csp-report. Cardinality
// is bounded by `directive` (≈ 25 known CSP directives mapped through an
// allowlist + an `other`/`unknown` bucket) × `disposition` (`report` |
// `enforce` | `unknown`) — so the time-series count tops out around
// 75 series. Driving the Phase-1 rollout dashboard for hardening card C2
// (`docs/security/hardening/C2-frontend-csp.md`): a sustained spike on a
// directive that we've explicitly allowed in the policy means the
// allowlist is too narrow; a sustained spike on a directive we never
// expected to fire means an exfiltration attempt or a third-party script
// drift. Both cases are actionable from `sum by (directive) (rate(...))`.
export const cspViolationTotal = new client.Counter({
  name: "csp_violation_total",
  help: "CSP violation reports posted by browsers to /api/csp-report",
  labelNames: ["directive", "disposition"],
  registers: [register],
});

// ───────────────────────── Log retention archive ───────────────
// Лічильник рядків, оброблених background-архіватором `openclaw_invocations`
// / `tg_alert_acks` / `n8n_webhook_events` (див.
// `apps/server/src/modules/logRetention/archivePoller.ts`).
// `outcome` — фінальний стан батча: `archived` (upload + DELETE OK),
// `upload_failed` (GCS відмовив → DB rows збережені), `noop` (нічого
// під TTL не потрапило).
export const logArchiveRowsTotal = new client.Counter({
  name: "openclaw_log_archive_rows_total",
  help: "Rows processed by the log retention archiver, by table + outcome",
  labelNames: ["table", "outcome"],
  registers: [register],
});

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

// ───────────────────────── n8n webhook-events replay (PR-29) ──
// Instrument-имо replay-CLI / API щоб дашборд `n8n-webhook-events`
// (PR-26-after) міг показати: which workflow-и replay-яться найчастіше,
// яка success-rate per-workflow, p95 латентності self-served replay-у.
// Cardinality bound: workflow_id ∈ REPLAYABLE_WORKFLOW_IDS (наразі 4),
// outcome ∈ {ok, http_error, unknown_workflow, timeout, error} —
// дешевий labels-set, безпечно крутити без top-K-обмеження.
export const n8nWebhookReplayAttemptsTotal = new client.Counter({
  name: "n8n_webhook_replay_attempts_total",
  help: "n8n webhook event replay attempts by workflow and outcome",
  labelNames: ["workflow_id", "outcome"], // ok|http_error|unknown_workflow|timeout|error
  registers: [register],
});

export const n8nWebhookReplayDurationMs = new client.Histogram({
  name: "n8n_webhook_replay_duration_ms",
  help: "n8n webhook event replay per-attempt duration in ms",
  labelNames: ["workflow_id", "outcome"],
  // Replay HTTP-call timeout = 10s (DEFAULT_TIMEOUT_MS у replayWebhookEvent.ts).
  // Buckets щільніше у нижчій частині, бо здорові replay-и зазвичай <500ms.
  buckets: [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [register],
});

// ───────────────────────── Mono token crypto (H4) ─────────────
/**
 * H4 Phase 2 — кількість прочитань `mono_connection.token_*` рядків, чий
 * ciphertext був зашифрований не поточною версією ключа (legacy unversioned
 * або стара версія після rotation). Інкрементиться один раз на read, що
 * тригерить lazy re-encrypt. Дозволяє під час rotation моніторити
 * `сума(stale) → 0` перед тим, як прибрати старий ключ із
 * `MONO_TOKEN_ENC_KEYS`.
 *
 * `row_version` — версія, під якою рядок БУВ зашифрований (stringified;
 * `"legacy"` для NULL `token_key_version`). `outcome`:
 *   - `reencrypted`      — read decrypt-нувся під старою версією, re-encrypt-
 *     write під current версією успішно записаний.
 *   - `reencrypt_failed` — decrypt OK, але re-encrypt-write кинув (best-effort;
 *     read НЕ провалився; рядок лишається під старою версією до наступного read-у).
 */
export const monoTokenLazyReencryptTotal = new client.Counter({
  name: "mono_token_lazy_reencrypt_total",
  help: "Reads of mono_connection.token_* rows still under a non-current key version, with lazy re-encrypt outcome (H4 Phase 2 rotation gauge)",
  labelNames: ["row_version", "outcome"], // row_version=legacy|1|2|…; outcome=reencrypted|reencrypt_failed
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

// Rule-based MCC lookup outcome — PR-17 (WF-06 mono optimization).
// `matched`   — MCC знайдений у `apps/server/src/lib/mcc/mccMap.ts`,
//               category-результат повернувся миттєво БЕЗ Anthropic-виклику.
// `unknown`   — MCC=0/null/undefined або відсутній у мапі → caller
//               провалюється у AI-fallback (`categorizeTransaction` →
//               `anthropicMessages`).
// Hit-rate (`matched / (matched + unknown)`) — це бюджет економії Claude:
// чим вищий — тим менше викликів у `categorize` proceed-нуть до AI.
export const monoMccMatchTotal = new client.Counter({
  name: "mono_mcc_match_total",
  help: "Rule-based MCC → category lookup outcome (matched|unknown)",
  labelNames: ["outcome"], // matched|unknown
  registers: [register],
});

// Hourly batch fallback для unknown-MCC — PR-18 (WF-06 mono optimization).
// `ok`         — Anthropic-batch повернув валідну category, ai_category_slug
//                записано у `mono_transaction`, queue.row → done.
// `missing`    — index відсутній у Claude-response або category поза enum-ом;
//                item повернувся у буфер до наступного tick-у.
// `requeued`   — item після N missed tick-ів redirect-нутий назад у per-row
//                queue (`MARK_RETRY_SQL`), щоб уникнути infinite-buffer-у.
// `failed`     — Anthropic 5xx / timeout / parse-throw; ВЕСЬ batch повернутий
//                у per-row queue (старий behaviour, як у specs PR-18).
// `dropped`    — overflow `MCC_BATCH_MAX_SIZE × 10`, caller вже зробив
//                fallback на per-row Anthropic у `enrichmentWorker`.
export const monoMccBatchProcessedTotal = new client.Counter({
  name: "mono_mcc_batch_processed_total",
  help: "MCC hourly batch fallback per-item outcomes",
  labelNames: ["outcome"], // ok|missing|requeued|failed|dropped
  registers: [register],
});

// Розмір окремого batch-Anthropic-виклику. p50/p95 показують, наскільки
// часто буфер заповнюється до `MCC_BATCH_MAX_SIZE` (sweet spot) проти
// маленьких batch-ів коли трафік низький.
export const monoMccBatchSize = new client.Histogram({
  name: "mono_mcc_batch_size",
  help: "Items per MCC hourly batch Anthropic call",
  buckets: [1, 5, 10, 25, 50, 75, 100, 150, 250],
  registers: [register],
});

// Тривалість одного batch-tick-у (drain → Anthropic → write-back).
export const monoMccBatchDurationMs = new client.Histogram({
  name: "mono_mcc_batch_duration_ms",
  help: "Per-tick MCC hourly batch duration (ms): drain → Anthropic → write-back",
  labelNames: ["outcome"], // ok|failed
  buckets: [100, 500, 1000, 2500, 5000, 10000, 25000, 60000],
  registers: [register],
});

// Поточна глибина in-memory буфер-у unknown-MCC items. Gauge оновлюється
// при кожному enqueue/drain. Якщо stuck-високий — batch-worker не запущений
// або фейлить підряд.
export const monoMccBufferDepth = new client.Gauge({
  name: "mono_mcc_buffer_depth",
  help: "Current size of in-memory unknown-MCC buffer",
  registers: [register],
});

// ───────────────── RAG eval weekly (post-PR-20 automation) ────
// Telemetry для weekly RAG-quality cron (`scripts/rag-eval-weekly.mjs`
// + `POST /api/internal/eval/rag-weekly`). Сетяться один раз за
// тиждень (Mon 06:00 Kyiv), затихають між run-ами — Prom-серверу
// це безболісно бо staleness обчислюється по
// `rag_eval_last_run_timestamp_seconds`.
export const ragEvalRecallAt4 = new client.Gauge({
  name: "rag_eval_recall_at_4",
  help: "Mean recall@4 from last weekly RAG eval run (0..1)",
  labelNames: ["mode"], // mock|simulate|live
  registers: [register],
});

export const ragEvalPrecisionAt1 = new client.Gauge({
  name: "rag_eval_precision_at_1",
  help: "Mean precision@1 from last weekly RAG eval run (0..1)",
  labelNames: ["mode"],
  registers: [register],
});

export const ragEvalMrr = new client.Gauge({
  name: "rag_eval_mrr",
  help: "Mean reciprocal rank from last weekly RAG eval run (0..1)",
  labelNames: ["mode"],
  registers: [register],
});

export const ragEvalLastRunTimestampSeconds = new client.Gauge({
  name: "rag_eval_last_run_timestamp_seconds",
  help: "Unix-timestamp of last successful weekly RAG eval run",
  registers: [register],
});

export const ragEvalLastRunStatus = new client.Gauge({
  name: "rag_eval_last_run_status",
  help: "Last RAG eval run status (0=pass, 1=warn, 2=kill, 3=error)",
  labelNames: ["mode"],
  registers: [register],
});

export const ragEvalRecordsTotal = new client.Counter({
  name: "rag_eval_records_total",
  help: "Total weekly RAG eval records received by internal endpoint",
  labelNames: ["status"], // pass|warn|kill|error
  registers: [register],
});

// ───────────────── Runtime kill-switches ──────────────────────
// In-memory feature kill-switch registry
// (`lib/featureFlags/runtimeKillSwitch.ts`). Активуються із RAG
// quality gate (recall@4 < kill threshold) або вручну через runbook.
export const runtimeKillSwitchActive = new client.Gauge({
  name: "runtime_kill_switch_active",
  help: "1 if runtime kill-switch is currently active, 0 otherwise",
  labelNames: ["switch"], // mono_ai_memory_ingest|rag_retrieval|rag_eval_weekly
  registers: [register],
});

export const runtimeKillSwitchActivationsTotal = new client.Counter({
  name: "runtime_kill_switch_activations_total",
  help: "Total runtime kill-switch state transitions",
  labelNames: ["switch", "outcome"], // outcome: activate|reactivate|deactivate
  registers: [register],
});

// ───────────────────────── Re-exports (barrel) ────────────────
// Registry, DB-pool gauges, build-info, helpers, and the sync / BullMQ-job
// metric families were extracted into `./metrics/*` for Hard Rule #18
// module-size discipline. Re-exported here so `../obs/metrics.js` stays the
// single public import path for every consumer.
export {
  register,
  dbPoolTotal,
  dbPoolIdle,
  dbPoolWaiting,
  dbSlowPoolConnectsTotal,
  dbPoolSizeCurrent,
  dbPoolAcquireDurationSeconds,
  appBuildInfo,
  statusClass,
  startPoolSampler,
  metricsHandler,
} from "./metrics/registry.js";
export type { StatusClass, PoolSamplerOptions } from "./metrics/registry.js";

export {
  syncOperationsTotal,
  syncDurationMs,
  syncPayloadBytes,
  syncStreamConnectionsActive,
  syncV1LegacyClientsTotal,
  syncOpLogApplyTotal,
  syncOpLogNullOriginDeviceIdTotal,
  syncOpLogPullLagMs,
  syncOpLogPullQueueDepth,
} from "./metrics/sync.js";

export {
  authMailJobsEnqueuedTotal,
  authMailJobsProcessedTotal,
  authMailJobDurationMs,
  authMailQueueDepth,
  ftuxDripJobsEnqueuedTotal,
  ftuxDripJobsProcessedTotal,
  ftuxDripJobDurationMs,
  ftuxDripQueueDepth,
  ftuxDripUnsubscribesTotal,
  aiMemoryIngestEnqueuedTotal,
  aiMemoryIngestProcessedTotal,
  aiMemoryIngestDurationMs,
  aiMemoryIngestQueueDepth,
} from "./metrics/jobs.js";
