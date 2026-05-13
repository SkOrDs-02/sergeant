import type { Request, Response } from "express";
import client from "prom-client";
import type { Pool } from "pg";

import { env } from "../env/env.js";
import { safeStringEqual } from "../http/safeCompare.js";

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

export const dbSlowPoolConnectsTotal = new client.Counter({
  name: "db_slow_pool_connects_total",
  help: "PG `pool.connect()` checkouts slower than PG_SLOW_CONNECT_MS — leading indicator of pool saturation before `db_pool_waiting > 0` sustains.",
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

/**
 * PR-33 — fixed monthly subscription cost для зовнішніх не-AI-провайдерів,
 * чий `usage` runtime-instance не бачить (Railway, Vercel, PostHog, Sentry).
 * Також тримає envelop-budget-и для AI-провайдерів (Anthropic / Voyage),
 * щоб у Grafana run-rate можна було накласти на target.
 *
 * Лейбли:
 *   - `provider`: railway | vercel | posthog | sentry | anthropic | voyage
 *   - `plan`: free | hobby | pro | team | business | enterprise | usage |
 *      budget — рівень підписки (для PostHog/Sentry — tier; для Anthropic/
 *      Voyage — `budget` коли значення = monthly cap, `usage` коли pay-as-you-go).
 *
 * Cardinality: 6 providers × ~7 plans = ~42 series (стабільно). Set один
 * раз на старті процесу (`obs/cost.ts::applyInfraMonthlyCosts()`) з env-
 * vars; невиставлене значення → не з'являється у `/metrics` зовсім (gauge
 * не пре-allocate-имо нулі, бо це б змусило в PromQL фільтрувати).
 */
export const infraMonthlyCostUsd = new client.Gauge({
  name: "infra_monthly_cost_usd",
  help: "Monthly fixed/budget cost in USD for external providers (PR-33)",
  labelNames: ["provider", "plan"],
  registers: [register],
});

/**
 * PR-38 (48-plan) — soft daily-burn threshold for Voyage embeddings (USD).
 *
 * Виставляється з env `VOYAGE_DAILY_BUDGET_USD` через
 * `applyVoyageDailyBudget()` у bootstrap-у (`apps/server/src/index.ts`).
 * Зчитується Prometheus-rule-ом `voyage-cost.yml`:
 *
 *   - `VoyageDailyBudgetSoftBreach`: 24h-burn > 80% × threshold (warn)
 *   - `VoyageDailyBudgetHardBreach`: 24h-burn ≥ 100% × threshold (page)
 *
 * Окрема gauge (а не `infra_monthly_cost_usd{plan="daily-budget"}`), бо
 * семантика різна (daily soft cap vs monthly subscription) і alert-rule
 * `voyage_daily_budget_usd > 0` як guard простіший, ніж filter по plan.
 *
 * Unlabeled Gauge → prom-client завжди публікує серію зі значенням `0`
 * за замовчанням (на відміну від labeled gauge-ів, де лейбли-комбінації
 * без `.set()` відсутні). Тому alert-expr має guard `voyage_daily_budget_usd > 0`
 * — на dev/staging без env-конфігу значення `0` не тригерить.
 */
export const voyageDailyBudgetUsd = new client.Gauge({
  name: "voyage_daily_budget_usd",
  help: 'Soft daily-burn threshold for Voyage embeddings in USD (PR-38). When >0, Prometheus rule voyage-cost.yml compares against increase(ai_cost_estimate_usd_total{provider="voyage"}[24h]).',
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

/**
 * M7 — `MAX_TOOL_ITERATIONS` cap hit: модель або клієнт перевищили жорсткий
 * ліміт `tool_use`-блоків в одному round-trip-і. `boundary` лейбл:
 *   - `anthropic_response` — Anthropic повернув >MAX_TOOL_ITERATIONS блоків
 *     `tool_use` в одній відповіді (runaway model loop).
 *   - `client_request` — клієнт надіслав >MAX_TOOL_ITERATIONS блоків у
 *     `tool_calls_raw` (manipulated payload або зіпсований state).
 *
 * Cardinality фіксована (2 значення) — безпечно для Prometheus.
 *
 * See `docs/security/hardening/M7-chat-tool-iteration-cap.md`.
 */
export const chatToolIterationCapHitTotal = new client.Counter({
  name: "chat_tool_iteration_cap_hit_total",
  help: "M7 — tool-iteration cap (MAX_TOOL_ITERATIONS) breached, request rejected with 422",
  labelNames: ["boundary"], // anthropic_response | client_request
  registers: [register],
});

/**
 * M6 — server-side magic-byte rejection at `/api/nutrition/{analyze,refine}-photo`.
 * `endpoint` лейбл фіксований (`analyze-photo` | `refine-photo`); `reason` — це
 * `code` з `validateImageBase64` (`INVALID_BASE64` | `TRUNCATED` | `TOO_LARGE`
 * | `MAGIC_MISMATCH`). Cardinality 2 × 4 = 8, безпечно для Prometheus.
 *
 * See `docs/security/hardening/M6-image-magic-byte-check.md`.
 */
export const nutritionPhotoRejectedTotal = new client.Counter({
  name: "nutrition_photo_rejected_total",
  help: "M6 — nutrition photo rejected before Anthropic call by magic-byte / size validator",
  labelNames: ["endpoint", "reason"],
  registers: [register],
});

/**
 * M8 — chat tool_result content matched a prompt-injection marker (`ignore
 * previous instructions`, `<system>`, `act as ...`). Лічильник інкрементиться
 * один раз на tool_result; `tool` — whitelisted tool name (з `TOOLS`-реєстру)
 * або `unknown` для orphan-блоків. Cardinality dominated by кількістю tools
 * (~25), безпечно для Prometheus.
 *
 * See `docs/security/hardening/M8-prompt-injection-tool-output.md`.
 */
export const chatPromptInjectionAttemptTotal = new client.Counter({
  name: "chat_prompt_injection_attempt_total",
  help: "M8 — tool_result content matched a prompt-injection marker; metric only, model still receives the (wrapped) data.",
  labelNames: ["tool"],
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

/**
 * PR-05 — Counter that ticks every time the AI-quota DB circuit-breaker
 * transitions INTO the OPEN state (either from CLOSED after `threshold`
 * DB-errors in the sliding window, or from HALF-OPEN when the probe
 * request itself fails). One sample per OPEN-trip — re-arm during HALF-OPEN
 * does not double-count.
 *
 * Labels:
 *   - `from`: closed | half-open — which state we tripped from. Useful to
 *     distinguish a real DB outage burst (`from=closed`) from a flap during
 *     recovery (`from=half-open`).
 *
 * Pairs with the generic `circuit_breaker_state{name="ai_quota"}` gauge —
 * this counter is the trip-rate signal feeding the Sentry alert
 * `ai_quota_circuit_opened` and the Alertmanager rule
 * `AIQuotaCircuitOpenedRecently` (see `docs/observability/alerts/`).
 */
export const aiQuotaCircuitOpenTotal = new client.Counter({
  name: "ai_quota_circuit_open_total",
  help: "AI-quota DB circuit-breaker transitions into OPEN (fail-closed start)",
  labelNames: ["from"], // closed | half-open
  registers: [register],
});

/**
 * H9 — `/api/transcribe` USD-cap circuit breaker. `outcome` лейбл:
 *   - `cap_hit` — pre-charge відсіяв виклик до Groq (402 у клієнта).
 *   - `store_unavailable` — DB недоступна, fail-open (логуємо для
 *     алерту, але виклик пройшов далі).
 * Cardinality фіксована (2 значення) — безпечно для Prometheus.
 */
export const transcribeUsdCapEventsTotal = new client.Counter({
  name: "transcribe_usd_cap_events_total",
  help: "H9 — transcribe per-user USD cap circuit-breaker events",
  labelNames: ["outcome"], // cap_hit | store_unavailable
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

/**
 * Stage 5 / PR #041: live SSE стрім real-time op-log (`syncV2Stream`).
 * Окремий gauge — long-lived connection-и не вписуються в існуючий
 * `sync_duration_ms` histogram (їх duration — це час до disconnect-у,
 * не час обробки op-у), а кардинальність `module=v2` фіксована.
 */
export const syncStreamConnectionsActive = new client.Gauge({
  name: "sync_stream_connections_active",
  help: "Active /api/v2/sync/stream SSE connections",
  labelNames: ["module"],
  registers: [register],
});

/**
 * Pre-sunset measurement для CloudSync v1 (Initiative 0003 Phase 1).
 *
 * Окремий counter (а не label-extension на `sync_operations_total`), бо:
 *   - інкрементиться **тільки на v1**-routes (`/api/sync/*`);
 *   - дозволяє pull-ити топ user-agent-classes / app-versions, що ще ходять
 *     у v1 → адресно push-ити update-нагадування перед T₀ (sunset date).
 *
 * Кардинальність: 5 (`user_agent_class`) × ≤20 (`app_version`) × 4 (`op`) =
 * ≤400 series. Logic у `apps/server/src/modules/sync/clientSurvey.ts` накладає
 * hard cap.
 */
export const syncV1LegacyClientsTotal = new client.Counter({
  name: "sync_v1_legacy_clients_total",
  help: "CloudSync v1 (LWW-blob) clients by UA-class and app-version (sunset survey)",
  labelNames: ["user_agent_class", "app_version", "op"],
  registers: [register],
});

/**
 * Per-op apply outcome для v2 op-log (PR #048, Stage 5 DoD #10).
 *
 * `syncOperationsTotal{op="v2_push"}` рахує **запит** (`ok|partial|conflict`),
 * але апдейтити дашборд RED-метрик per-table треба бачити **per-op**
 * розклад: applied/rejected/duplicate × table × reject_reason. Цей лічильник
 * інкрементиться один раз на `op` всередині `syncV2Push`, на тому ж місці,
 * де ми вже пишемо row у `sync_op_log` (тож кардинальність обмежена записами).
 *
 * Лейбли:
 *   - `table` ∈ whitelist `OP_LOG_TABLE_REGISTRY` (≤ ~15)
 *     + `__unknown__` для table_not_allowed-rejected ops.
 *   - `status` ∈ `applied|rejected|duplicate`.
 *   - `reason` — машинно-читабельний reject-reason (`lww_conflict`,
 *     `tombstoned`, `fk_violation`, `clock_skew`, `apply_failed`,
 *     `table_not_allowed`, `missing_*`, `invalid_*`, …) для `rejected`;
 *     `"none"` для `applied`; `"duplicate"` для `duplicate`. Reasons
 *     походять із зафіксованого набору в коді (`syncV2.ts`) — нові варіанти
 *     додаються свідомо разом із кодовою зміною, тож кардинальність не
 *     розповзається.
 *
 * Cardinality cap: ~15 tables × 3 statuses × ~25 reasons ≈ 1100 series
 * worst-case (типовий runtime ~50–100 active series, бо більшість reject-
 * reason-ів не репродукуються в production).
 *
 * Grafana queries (`docs/observability/dashboards/sync.json`):
 *   sum by (table, status) (rate(sync_op_log_apply_total[5m]))
 *   topk(10, sum by (table, reason)
 *     (rate(sync_op_log_apply_total{status="rejected"}[5m])))
 */
export const syncOpLogApplyTotal = new client.Counter({
  name: "sync_op_log_apply_total",
  help: "v2 sync op-log per-op apply outcomes (PR #048): applied / rejected / duplicate, broken down by table and reject_reason",
  labelNames: ["table", "status", "reason"],
  registers: [register],
});

/**
 * Counter for `sync_op_log` inserts where `origin_device_id` came in as
 * NULL on the client side (i.e. the client did not forward
 * `X-Origin-Device-Id`). The pull/SSE filter rejects every NULL-origin
 * row when called with a NULL header (`NULL IS DISTINCT FROM NULL`
 * evaluates to `FALSE` in PG), so a sustained non-zero rate here is a
 * data-integrity regression: multi-device convergence is silently
 * broken for the affected user(s).
 *
 * Labels:
 *   - `module` is always `"v2"` for label-uniformity with the other
 *     sync_* metrics — the dimension exists so a future op-log dialect
 *     can be tagged without breaking dashboards.
 *
 * Alert: `rate(sync_op_log_null_origin_device_id_total[15m]) > 0` for
 * 30m. Expected resting value post-fix: 0. Spikes during canary rollout
 * are expected for clients that have not yet picked up the new bundle.
 */
export const syncOpLogNullOriginDeviceIdTotal = new client.Counter({
  name: "sync_op_log_null_origin_device_id_total",
  help: "Inserts into sync_op_log where origin_device_id arrived as NULL (client did not forward X-Origin-Device-Id). Sustained non-zero = multi-device convergence broken.",
  labelNames: ["module"],
  registers: [register],
});

/**
 * Pull-lag (queue-staleness) гістограма для v2 sync (PR #048, RED-stack
 * "Latency"). На кожному `GET /v2/sync/pull` із непорожньою відповіддю
 * спостерігаємо `now - server_ts(newest_op_returned)` — це проксі
 * *user-perceived staleness*: скільки часу ops чекали в op-log, перш
 * ніж клієнт їх забрав. SSE stream-у (PR #041) має тримати це <100ms у
 * happy path; cursor-based polling — кілька секунд.
 *
 * Spike = клієнт довго був offline (ОК) **або** SSE-стрім впав і клієнт
 * fallback-нувся на polling (warning). Persistent-spike → аларм.
 *
 * Bucket-сітка покриває під 100ms (SSE happy path) до 1h (offline-replay
 * після довгої відсутності).
 */
export const syncOpLogPullLagMs = new client.Histogram({
  name: "sync_op_log_pull_lag_ms",
  help: "v2 sync pull staleness in ms: now - server_ts of newest op returned in this pull (PR #048)",
  buckets: [
    50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000, 300_000,
    900_000, 3_600_000,
  ],
  registers: [register],
});

/**
 * Queue-depth histogram для pull-у: скільки ops повернули за один
 * `GET /v2/sync/pull` (PR #048). Це проксі *behind-cursor depth*:
 * якщо p95 = LIMIT (зазвичай 200), значить є ще ops за курсором — клієнт
 * має зробити наступний pull. Sustained p95 = LIMIT → backpressure.
 *
 * Окрема метрика від `sync_payload_bytes`, бо кількість ops не корелює
 * лінійно з байтами (один meal ≪ один workout зі 50 set-ами).
 */
export const syncOpLogPullQueueDepth = new client.Histogram({
  name: "sync_op_log_pull_queue_depth",
  help: "v2 sync pull op-count returned per request (PR #048) — proxy for behind-cursor queue depth",
  buckets: [0, 1, 5, 10, 25, 50, 100, 200, 500, 1000],
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
    version: env.npm_package_version || "unknown",
    commit: (
      env.RAILWAY_GIT_COMMIT_SHA ||
      env.GIT_COMMIT ||
      env.VERCEL_GIT_COMMIT_SHA ||
      "unknown"
    ).slice(0, 12),
    release: env.SENTRY_RELEASE || env.RAILWAY_GIT_COMMIT_SHA || "unknown",
    env: env.NODE_ENV || "development",
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

// ───────────────────── FTUX drip jobs (BullMQ) ────────────────
// Metric set дзеркалить auth-mail-набір. Лейбл `day` (`day_0|day_1|day_3`)
// дозволяє відрізняти Day-0 (immediate) від delayed-job-ів і дивитись на
// drop-off між днями (Day 0 надсилається 100%, Day 1/3 — після opt-out
// фільтрації + idempotency-перевірок). Лейбл `outcome` для processedTotal:
//   - `ok` — лист пішов через Resend
//   - `skipped_optout` — opt-out зафіксований у `email_unsubscribes`
//   - `skipped_already_sent` — `email_campaigns_log` уже має row
//   - `skipped_user_deleted` — юзера вже немає (3-day-ге очікування)
//   - `retry` / `permanent_fail` — як і в auth-mail.
export const ftuxDripJobsEnqueuedTotal = new client.Counter({
  name: "ftux_drip_jobs_enqueued_total",
  help: "FTUX drip mail enqueue attempts by mode and day",
  labelNames: ["mode", "day"], // mode: queued|fallback|skipped_no_redis|enqueue_error
  registers: [register],
});

export const ftuxDripJobsProcessedTotal = new client.Counter({
  name: "ftux_drip_jobs_processed_total",
  help: "FTUX drip mail processor outcomes",
  labelNames: ["outcome", "day"],
  // outcome: ok|retry|permanent_fail|skipped_optout|skipped_already_sent|skipped_user_deleted
  registers: [register],
});

export const ftuxDripJobDurationMs = new client.Histogram({
  name: "ftux_drip_job_duration_ms",
  help: "FTUX drip mail per-job duration (ms)",
  labelNames: ["outcome", "day"],
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000],
  registers: [register],
});

export const ftuxDripQueueDepth = new client.Gauge({
  name: "ftux_drip_queue_depth",
  help: "BullMQ ftux-drip queue depth by status",
  labelNames: ["status"], // waiting|active|delayed|failed
  registers: [register],
});

export const ftuxDripUnsubscribesTotal = new client.Counter({
  name: "ftux_drip_unsubscribes_total",
  help: "FTUX drip opt-out clicks by outcome",
  labelNames: ["outcome"], // ok|already_unsubscribed|invalid_token|missing_secret
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
  // mode: queued|fallback|enqueue_error|disabled|source_disabled
  //   queued          — job pushed to BullMQ successfully
  //   fallback        — Redis unavailable; in-process direct dispatch
  //   enqueue_error   — Redis push failed (network / serialization / invalid source)
  //   disabled        — master AI_MEMORY_ENABLED=false (kills all sources)
  //   source_disabled — per-source flag off (e.g. MONO_AI_MEMORY_INGEST_ENABLED=false)
  labelNames: ["mode", "source"],
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
 * `Authorization: Bearer <token>`. У dev/локально можна не ставити токен
 * (production хард-фейлить у `assertStartupEnv` — див. T2 audit #4).
 *
 * Токен-compare використовує `safeStringEqual` (поверх
 * `crypto.timingSafeEqual`) замість наївного `!==`, щоб не лікати
 * позицію першої розбіжності через CPU branch-timing — мережевий
 * атакуючий міг би статистично відновити токен побайтово.
 */
export function metricsHandler(req: Request, res: Response): void {
  const expected = env.METRICS_TOKEN;
  if (expected) {
    const auth = req.get("authorization") || "";
    const got = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!safeStringEqual(got, expected)) {
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
