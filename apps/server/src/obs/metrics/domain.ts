import client from "prom-client";

import { register } from "./registry.js";

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
  // reason: limit|disabled|tool_disabled|tool_limit|circuit_open
  // cost:   numeric cost that was attempted (stringified for label cardinality;
  //         values are bounded by the small set of configured tool costs —
  //         typically "1" for default-bucket, "3" for tool-use).
  labelNames: ["reason", "cost"],
  registers: [register],
});

/**
 * Accumulates the total AI-quota cost units consumed by accepted requests,
 * split by subject_type (user|anon) and bucket_type (default|tool).
 *
 * Counterpart to `aiQuotaBlocksTotal` for the accept-path: together they give
 * a full picture of quota pressure.
 *
 *   rate(ai_cost_consumed_total{subject_type="user"}[5m]) → user burn-rate
 *   rate(ai_cost_consumed_total{bucket_type="tool"}[5m])  → tool-use cost rate
 *
 * `subject_type`:
 *   - `user` — authenticated session (subject key starts with `u:`)
 *   - `anon` — anonymous/IP-keyed caller (subject key starts with `ip:`)
 * `bucket_type`:
 *   - `default` — plain chat / coach / nutrition requests (cost = 1)
 *   - `tool`    — per-tool-use bucket (cost = toolCost(), typically 3)
 */
export const aiCostConsumedTotal = new client.Counter({
  name: "ai_cost_consumed_total",
  help: "Total AI quota cost units consumed by accepted requests, by subject type and bucket type",
  labelNames: ["subject_type", "bucket_type"], // subject_type=user|anon; bucket_type=default|tool
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
