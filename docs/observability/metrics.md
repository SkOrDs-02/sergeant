# Довідник Prometheus-метрик

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

Каталог усіх Prometheus-метрик бекенду Sergeant (`GET /metrics`, bearer `METRICS_TOKEN`).
Джерело істини — [`metrics.ts`](../../apps/server/src/obs/metrics.ts).
Суміжні docs: [SLO.md](./SLO.md) · [dashboards.md](./dashboards.md) · [runbook.md](./runbook.md) · [`prometheus/`](./prometheus/).

---

## Конвенція неймінгу / лейблінгу

| Правило                                | Приклад                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Counters → `_total`                    | `http_requests_total`                                                             |
| Histograms мілісекунд → `_duration_ms` | `sync_duration_ms`                                                                |
| `outcome` — loose-typed enum string    | `ok` · `error` · `timeout` · `hit` · `miss`                                       |
| `module` — high-level domain           | `finyk` · `fizruk` · `nutrition` · `routine` · `auth` · `sync` · `chat` · `coach` |
| `status_class` — HTTP status bucket    | `2xx` · `3xx` · `4xx` · `5xx` · `other`                                           |

**Заборонено** у labels: userId, email, IP, requestId, raw tokens, exception messages, user-agent, будь-які ID. Лише low-cardinality enum-и.

---

## 1. HTTP (RED)

| Metric                     | Type      | Labels                                        | Emitter                                                          |
| -------------------------- | --------- | --------------------------------------------- | ---------------------------------------------------------------- |
| `http_requests_total`      | Counter   | `method` · `path` · `status` · `module`       | [requestLog.ts:65](../../apps/server/src/http/requestLog.ts#L65) |
| `http_request_duration_ms` | Histogram | `method` · `path` · `status_class`            | [requestLog.ts:71](../../apps/server/src/http/requestLog.ts#L71) |
| `http_errors_total`        | Counter   | `method` · `path` · `status_class` · `module` | [requestLog.ts:79](../../apps/server/src/http/requestLog.ts#L79) |
| `http_in_flight`           | Gauge     | `method`                                      | [requestLog.ts:37](../../apps/server/src/http/requestLog.ts#L37) |

Buckets-duration: `5, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000` ms. `path` = route pattern (не raw URL) → fallback `"unknown"` ([requestLog.ts:46](../../apps/server/src/http/requestLog.ts#L46)). `http_errors_total` інкрементується лише при `status ≥ 400`. `module` — з ALS.

**Кардинальність**: ~20 path × 4 method × 6 status-class × ~15 module ≈ **7 200** серій (counter); histogram ~4 800.

```promql
sum by (path) (rate(http_requests_total[5m]))                              # RPS
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))  # SLI 99%
histogram_quantile(0.95, sum by (le, path) (rate(http_request_duration_ms_bucket[5m]))) # p95
```

**SLO/alerts**: [SLO.md §1–2](./SLO.md#1-http-api-availability-slo-990-) · `HttpErrorBudgetBurn{Fast,Slow}` · `HttpLatencyP95High` · recording rules `sli:http_error:ratio_rate*`.

---

## 2. Postgres (USE)

| Metric                  | Type      | Labels | Emitter                                                                                    |
| ----------------------- | --------- | ------ | ------------------------------------------------------------------------------------------ |
| `db_query_duration_ms`  | Histogram | `op`   | [db.ts:86](../../apps/server/src/db.ts#L86)                                                |
| `db_errors_total`       | Counter   | `code` | [db.ts:46](../../apps/server/src/db.ts#L46), [db.ts:108](../../apps/server/src/db.ts#L108) |
| `db_slow_queries_total` | Counter   | `op`   | [db.ts:92](../../apps/server/src/db.ts#L92)                                                |
| `db_pool_total`         | Gauge     | —      | [metrics.ts:341](../../apps/server/src/obs/metrics.ts#L341) `startPoolSampler()`           |
| `db_pool_idle`          | Gauge     | —      | ↑                                                                                          |
| `db_pool_waiting`       | Gauge     | —      | ↑                                                                                          |

Buckets duration: `1, 5, 25, 100, 250, 1000, 5000` ms. Slow threshold: `DB_SLOW_MS` (default 200 ms). Pool sampler кожні 10 с, запускається з [index.ts:44](../../apps/server/src/index.ts#L44).

**Кардинальність**: ~15 op × 7 buckets = **105**; gauges — 3 серії.

```promql
histogram_quantile(0.95, sum by (le, op) (rate(db_query_duration_ms_bucket[5m])))  # p95 per op
sum by (op) (rate(db_slow_queries_total[5m]))                                      # slow rate
max(db_pool_waiting)                                                                # contention
```

**Alerts**: `DbPoolWaitingSustained` (ticket/5m) · `DbPoolSaturated` (page/10m) — [runbook.md](./runbook.md#dbpoolwaitingsustained).

---

## 3. Auth

| Metric                            | Type      | Labels           | Emitter                                                                                                                       |
| --------------------------------- | --------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `auth_attempts_total`             | Counter   | `op` · `outcome` | [authMiddleware.ts:106](../../apps/server/src/http/authMiddleware.ts#L106), [auth.ts:192](../../apps/server/src/auth.ts#L192) |
| `auth_session_lookup_duration_ms` | Histogram | `outcome`        | [auth.ts:191](../../apps/server/src/auth.ts#L191)                                                                             |

`op`: `sign_in` · `sign_up` · `forget_password` · `reset_password` · `signout` · `session_check`. `outcome`: `ok` · `bad_credentials` · `rate_limited` · `invalid` · `error` · `hit` · `miss`. Buckets: `1, 5, 10, 25, 50, 100, 250, 500, 1000` ms.

**Кардинальність**: 6 op × 7 outcome ≈ **42**; histogram 3 outcome × 9 buckets = **27**.

```promql
sum by (op, outcome) (rate(auth_attempts_total[5m]))                                       # breakdown
histogram_quantile(0.95, sum by (le) (rate(auth_session_lookup_duration_ms_bucket[5m])))    # p95 lookup
sum(rate(auth_attempts_total{outcome="error"}[5m])) / sum(rate(auth_attempts_total[5m]))    # SLI 99%
```

**SLO/alerts**: [SLO.md §4](./SLO.md#4-auth-slo-990-) · `AuthErrorBudgetBurn{Fast,Slow}` · `AuthSessionLookupSlow` · `AuthRateLimitSpike`.

---

## 4. Sync

| Metric                  | Type      | Labels                      | Emitter                                                      |
| ----------------------- | --------- | --------------------------- | ------------------------------------------------------------ |
| `sync_operations_total` | Counter   | `op` · `module` · `outcome` | [sync.ts:91](../../apps/server/src/modules/sync/sync.ts#L91) |
| `sync_duration_ms`      | Histogram | `op` · `module`             | [sync.ts:92](../../apps/server/src/modules/sync/sync.ts#L92) |
| `sync_payload_bytes`    | Histogram | `op` · `module`             | [sync.ts:93](../../apps/server/src/modules/sync/sync.ts#L93) |
| `sync_conflicts_total`  | Counter   | `module`                    | [sync.ts:66](../../apps/server/src/modules/sync/sync.ts#L66) |

`op`: `push` · `pull` · `push_all` · `pull_all`. `module`: `finyk` · `fizruk` · `routine` · `nutrition` · `profile`. `outcome`: `ok` · `empty` · `conflict` · `invalid` · `too_large` · `unauthorized` · `error`. Buckets duration: `10…10000` ms; bytes: `1024…5242880` (MAX_BLOB_SIZE = 5 MB).

**Кардинальність**: 4 × 5 × 7 ≈ **140** (counter); histograms ~180 кожна.

```promql
sum by (op, module, outcome) (rate(sync_operations_total[5m]))                              # breakdown
histogram_quantile(0.95, sum by (le, op, module) (rate(sync_duration_ms_bucket[5m])))       # p95
sum(rate(sync_operations_total{op=~"push|push_all",outcome="conflict"}[1h]))
  / sum(rate(sync_operations_total{op=~"push|push_all"}[1h]))                              # conflict ratio
```

**SLO/alerts**: [SLO.md §3](./SLO.md#3-sync-slo-995-) · `SyncErrorBudgetBurn{Fast,Slow}` · `SyncLatencyP95High` · `SyncConflictSpike`.

---

## 5. Rate-limit

| Metric                  | Type    | Labels            | Emitter                                                        |
| ----------------------- | ------- | ----------------- | -------------------------------------------------------------- |
| `rate_limit_hits_total` | Counter | `key` · `outcome` | [rateLimit.ts:10](../../apps/server/src/http/rateLimit.ts#L10) |

`key`: `api:auth:sensitive` · `api:web-vitals` · `api:chat` тощо. `outcome`: `allowed` · `blocked`. **Кардинальність**: ~6 × 2 = **12**.

```promql
sum by (key, outcome) (rate(rate_limit_hits_total[5m]))
rate(rate_limit_hits_total{key="api:auth:sensitive",outcome="blocked"}[5m])    # brute-force?
```

**Alert**: `AuthRateLimitSpike` via `sli:auth_rate_limited:ratio_rate5m` — [runbook.md](./runbook.md#authratelimitspike).

---

## 6. AI (Anthropic)

| Metric                             | Type      | Labels                                        | Emitter                                                                                  |
| ---------------------------------- | --------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ai_requests_total`                | Counter   | `provider` · `model` · `endpoint` · `outcome` | [anthropic.ts:82](../../apps/server/src/lib/anthropic.ts#L82)                            |
| `ai_request_duration_ms`           | Histogram | `provider` · `model` · `endpoint`             | [anthropic.ts:89](../../apps/server/src/lib/anthropic.ts#L89)                            |
| `ai_tokens_total`                  | Counter   | `provider` · `model` · `kind`                 | [anthropic.ts:131](../../apps/server/src/lib/anthropic.ts#L131)                          |
| `anthropic_prompt_cache_hit_total` | Counter   | `version` · `outcome`                         | [anthropic.ts:161](../../apps/server/src/lib/anthropic.ts#L161)                          |
| `ai_quota_blocks_total`            | Counter   | `reason`                                      | [aiQuota.ts:168](../../apps/server/src/modules/chat/aiQuota.ts#L168)                     |
| `ai_quota_fail_open_total`         | Counter   | `reason`                                      | [aiQuota.ts](../../apps/server/src/modules/chat/aiQuota.ts) `logQuotaStoreUnavailable()` |

`outcome` (requests): `ok` · `rate_limited` · `timeout` · `error` · `bad_response`. `kind` (tokens): `prompt` · `completion` · `cache_write` · `cache_read`. `outcome` (cache): `hit` · `miss`. `reason` (quota blocks): `limit` · `disabled` · `tool_disabled`. `reason` (fail-open): `database_url_missing` · `db_error`. Buckets duration: `100…60000` ms.

**Кардинальність**: requests ~120; tokens ~12; quota ~5. Загалом ≈ **~150**.

```promql
sum(rate(ai_requests_total{outcome!="ok"}[5m])) / sum(rate(ai_requests_total[5m]))         # SLI 97%
histogram_quantile(0.95, sum by (le, endpoint) (rate(ai_request_duration_ms_bucket[5m])))  # p95 per endpoint
sum(rate(anthropic_prompt_cache_hit_total{outcome="hit"}[5m]))
  / sum(rate(anthropic_prompt_cache_hit_total[5m]))                                        # cache hit ratio
```

**SLO/alerts**: [SLO.md §5](./SLO.md#5-ai-anthropic-slo-970-) · `AiErrorBudgetBurn{Fast,Slow}` · `AiLatencyP95High` · `AiQuotaStoreDown` — [runbook.md](./runbook.md#aierrorbudgetburn).

---

## 7. HubChat tools

| Metric                             | Type    | Labels             | Emitter                                                                                                                                  |
| ---------------------------------- | ------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `chat_tool_invocations_total`      | Counter | `tool` · `outcome` | [toolMetrics.ts:53](../../apps/server/src/modules/chat/toolMetrics.ts#L53), [:96](../../apps/server/src/modules/chat/toolMetrics.ts#L96) |
| `chat_tool_result_truncated_total` | Counter | `reason`           | [toolResultTruncation.ts:132](../../apps/server/src/modules/chat/toolResultTruncation.ts#L132)                                           |

`tool`: whitelist із `TOOLS` ([toolMetrics.ts:23](../../apps/server/src/modules/chat/toolMetrics.ts#L23)) або `"unknown"`. `outcome`: `proposed` · `executed` · `unknown_tool`. `reason`: `size_threshold`. **Кардинальність**: ~32 tool × 3 = **96**; truncation = **1**.

```promql
sum by (tool) (rate(chat_tool_invocations_total{outcome="proposed"}[5m]))                  # tool popularity
sum by (tool) (rate(chat_tool_invocations_total{outcome="proposed"}[1h]))
  - sum by (tool) (rate(chat_tool_invocations_total{outcome="executed"}[1h]))              # user cancels
```

---

## 8. Зовнішній HTTP

| Metric                         | Type      | Labels                 | Emitter                                                                                                                            |
| ------------------------------ | --------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `external_http_requests_total` | Counter   | `upstream` · `outcome` | [externalHttp.ts:30](../../apps/server/src/lib/externalHttp.ts#L30), [anthropic.ts:78](../../apps/server/src/lib/anthropic.ts#L78) |
| `external_http_duration_ms`    | Histogram | `upstream` · `outcome` | [externalHttp.ts:32](../../apps/server/src/lib/externalHttp.ts#L32), [anthropic.ts:80](../../apps/server/src/lib/anthropic.ts#L80) |

`upstream`: `monobank` · `privat` · `anthropic` · `off` · `usda` · `upcitemdb`. `outcome`: `ok` · `error` · `timeout` · `rate_limited` · `hit` · `miss` · `circuit_open`. Buckets: `25…20000` ms. **Cardinality**: ~42 (counter); histogram ~378.

```promql
sum by (upstream, outcome) (rate(external_http_requests_total[5m]))                        # breakdown
sum by (upstream) (rate(external_http_requests_total{outcome=~"error|timeout"}[5m]))
  / sum by (upstream) (rate(external_http_requests_total[5m]))                             # SLI 95%
```

**SLO/alert**: [SLO.md §6](./SLO.md#6-external-http-per-upstream-slo-950-) · `ExternalHttpErrorBudgetBurnSlow`.

---

## 9. Web-push

| Metric             | Type    | Labels    | Emitter                                                   |
| ------------------ | ------- | --------- | --------------------------------------------------------- |
| `push_sends_total` | Counter | `outcome` | [push/send.ts:45](../../apps/server/src/push/send.ts#L45) |

`outcome`: `ok` · `invalid_endpoint` · `rate_limited` · `error`. **Кардинальність**: **4**.

```promql
sum by (outcome) (rate(push_sends_total[5m]))
```

---

## 10. Mono-webhook-и

| Metric                        | Type      | Labels   | Emitter                                                                     |
| ----------------------------- | --------- | -------- | --------------------------------------------------------------------------- |
| `mono_webhook_received_total` | Counter   | `status` | [mono/webhook.ts:63](../../apps/server/src/modules/mono/webhook.ts#L63) ff. |
| `mono_webhook_duration_ms`    | Histogram | `status` | [mono/webhook.ts:173](../../apps/server/src/modules/mono/webhook.ts#L173)   |

`status`: `ok` · `invalid_secret` · `bad_payload` · `error`. Buckets: `1, 5, 25, 50, 100, 250, 500, 1000` ms. **Кардинальність**: 4 (counter); 32 (histogram).

```promql
sum(rate(mono_webhook_received_total{status="ok"}[5m])) / sum(rate(mono_webhook_received_total[5m]))
histogram_quantile(0.95, sum by (le) (rate(mono_webhook_duration_ms_bucket[5m])))
```

---

## 11. Barcode-лукапи

| Metric                  | Type    | Labels               | Emitter                                                                   |
| ----------------------- | ------- | -------------------- | ------------------------------------------------------------------------- |
| `barcode_lookups_total` | Counter | `source` · `outcome` | [barcode.ts:153](../../apps/server/src/modules/nutrition/barcode.ts#L153) |

`source`: `off` · `usda` · `upcitemdb`. `outcome`: `hit` · `miss` · `error`. Свідоме дублювання з `external_http_requests_total`. **Кардинальність**: **9**.

```promql
sum by (source) (rate(barcode_lookups_total{outcome="hit"}[5m])) / sum by (source) (rate(barcode_lookups_total[5m]))
```

---

## 12. Frontend-CWV

| Metric                   | Type      | Labels              | Emitter                                                                           |
| ------------------------ | --------- | ------------------- | --------------------------------------------------------------------------------- |
| `web_vitals_duration_ms` | Histogram | `metric` · `rating` | [web-vitals.ts:72](../../apps/server/src/modules/observability/web-vitals.ts#L72) |
| `web_vitals_cls`         | Histogram | `rating`            | [web-vitals.ts:70](../../apps/server/src/modules/observability/web-vitals.ts#L70) |

`metric`: `LCP` · `INP` · `FCP` · `TTFB`. `rating`: `good` · `needs-improvement` · `poor`. Endpoint `POST /api/metrics/web-vitals` (anonymous, `sendBeacon`). Buckets duration: `50…10000` ms; CLS: `0.01…1`. **Кардинальність**: 4 × 3 × 11 + 3 × 7 = **153**.

| CWV  | good      | needs-improvement | poor   |
| ---- | --------- | ----------------- | ------ |
| LCP  | ≤ 2500 ms | ≤ 4000            | > 4000 |
| INP  | ≤ 200     | ≤ 500             | > 500  |
| FCP  | ≤ 1800    | ≤ 3000            | > 3000 |
| TTFB | ≤ 800     | ≤ 1800            | > 1800 |
| CLS  | ≤ 0.1     | ≤ 0.25            | > 0.25 |

```promql
sum by (metric) (rate(web_vitals_duration_ms_count{rating="poor"}[1h]))
  / sum by (metric) (rate(web_vitals_duration_ms_count[1h]))                               # % poor
histogram_quantile(0.75, sum by (le) (rate(web_vitals_duration_ms_bucket{metric="LCP"}[1h])))  # p75 LCP
```

---

## 13. Помилки додатку

| Metric             | Type    | Labels                                | Emitter                                                              |
| ------------------ | ------- | ------------------------------------- | -------------------------------------------------------------------- |
| `app_errors_total` | Counter | `kind` · `status` · `code` · `module` | [errorHandler.ts:38](../../apps/server/src/http/errorHandler.ts#L38) |

`kind`: `operational` (AppError) · `programmer`. `status`: HTTP-status-рядок. `code`: `VALIDATION` · `UNAUTHORIZED` · `INTERNAL` · `RATE_LIMIT` · `BAD_REQUEST` тощо. **Кардинальність**: реально ~50–100.

```promql
sum by (module) (rate(app_errors_total{kind="programmer"}[5m]))    # bugs — always investigate
sum by (module, code) (rate(app_errors_total{status=~"5.."}[5m]))  # 5xx by module
```

**Alert**: `ProgrammerErrorsIncreasing` — [runbook.md](./runbook.md#programmererrors).

---

## 14. Process-рівень

| Metric                       | Type    | Labels | Emitter                                             |
| ---------------------------- | ------- | ------ | --------------------------------------------------- |
| `unhandled_rejections_total` | Counter | —      | [index.ts:164](../../apps/server/src/index.ts#L164) |
| `uncaught_exceptions_total`  | Counter | —      | [index.ts:180](../../apps/server/src/index.ts#L180) |

**Кардинальність**: **2**. В нормі обидві = 0.

```promql
increase(unhandled_rejections_total[5m]) > 0    # always a bug
increase(uncaught_exceptions_total[5m]) > 0     # process state corrupted
```

**Alerts**: `UnhandledRejectionObserved` · `UncaughtExceptionObserved` (page, instant) — [runbook.md](./runbook.md#unhandledrejection--uncaughtexception).

---

## 15. Default-метрики Node-runtime

`client.collectDefaultMetrics({ register })` ([metrics.ts:11](../../apps/server/src/obs/metrics.ts#L11)) реєструє стандартні `prom-client` метрики: `process_cpu_seconds_total`, `process_resident_memory_bytes`, `nodejs_eventloop_lag_seconds`, GC-метрики тощо. Фіксована кардинальність ~15–20 серій. Використовуються в runbook для діагностики OOM ([runbook.md §HttpErrorBudgetBurn p.6](./runbook.md#httperrorbudgetburn)).

---

## Бюджет кардинальності / bad-smell-и

Загальна оцінка: 36 кастомних метрик генерують ≈ **8 000–10 000 серій** — прийнятно для single-instance Railway.

**Антипатерни, яких уникнуто:**

1. **Raw URL → route pattern.** `path` з `req.route?.path`, fallback `"unknown"` ([requestLog.ts:46](../../apps/server/src/http/requestLog.ts#L46)). Без цього кожен scan `/wp-admin` тощо створив би нову серію.
2. **No PII у labels.** Email fingerprint лише в Pino-лог, не в Prometheus ([authMiddleware.ts:37](../../apps/server/src/http/authMiddleware.ts#L37)).
3. **Tool name whitelist.** Невідомі tools → `"unknown"` ([toolMetrics.ts:23](../../apps/server/src/modules/chat/toolMetrics.ts#L23)).
4. **Error code, не error message.** `app_errors_total` — enum `code` + `kind`, не `err.message`.
5. **User-agent** тільки в Pino-лог ([requestLog.ts:61](../../apps/server/src/http/requestLog.ts#L61)).

**На що звернути увагу:** `http_requests_total{status}` має raw HTTP status (~15–20 значень), на відміну від `status_class` у інших метриках.

---

## Відкриті питання

Сиріт і несумісних label-set-ів **не знайдено**. Всі 36 метрик інкрементуються щонайменше в одному emitter.

Потенційні покращення (не баги):

1. `mono_webhook_duration_ms` записується на `ok` і `error` ([webhook.ts:173](../../apps/server/src/modules/mono/webhook.ts#L173), [:185](../../apps/server/src/modules/mono/webhook.ts#L185)), але **не** на ранніх exit-ах `invalid_secret`/`bad_payload` ([webhook.ts:63](../../apps/server/src/modules/mono/webhook.ts#L63), [:102](../../apps/server/src/modules/mono/webhook.ts#L102)). Свідомий вибір, але для повноти histogram можна записувати й там.
