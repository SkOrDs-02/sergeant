# ADR-0015: Observability stack — Pino + Prometheus + Sentry

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/observability/SLO.md`](../observability/SLO.md) — SLI/SLO і burn-rate алерти.
  - [`docs/observability/dashboards.md`](../observability/dashboards.md) — Grafana стартер-пак.
  - [`docs/observability/runbook.md`](../observability/runbook.md) — playbook на алерти.
  - [`apps/server/src/obs/`](../../apps/server/src/obs/) — Pino logger, Prometheus registry, request context.
  - [`apps/server/src/sentry.ts`](../../apps/server/src/sentry.ts) — Sentry bootstrap (server).
  - [`apps/web/src/core/observability/sentry.ts`](../../apps/web/src/core/observability/sentry.ts) — client-side Sentry.
  - [`apps/web/src/core/observability/webVitals.ts`](../../apps/web/src/core/observability/webVitals.ts) — INP/CLS/LCP beacons.

---

## 0. TL;DR

Три незалежні шари спостереження, з чіткими **зонами відповідальності**:

| Шар            | Що                                         | Де                                      | Коли                               |
| -------------- | ------------------------------------------ | --------------------------------------- | ---------------------------------- |
| **Pino**       | Structured JSON-логи + ALS request context | stdout (Railway ingest)                 | Кожен request, кожна domain подія  |
| **Prometheus** | RED-метрики + USE + domain counters        | `/metrics` bearer-scraped               | Кожна HTTP-операція, sync, AI tool |
| **Sentry**     | Unhandled errors + breadcrumbs             | Sentry.io (client + server, окремі DSN) | Тільки fatal/error                 |

**Ключові рішення:**

1. **Pino для логів**, не console.log — ALS-context (`{requestId, userId, module}`)
   auto-injected у кожен log entry.
2. **Prometheus-first для метрик**, не custom time-series DB — текстовий
   `/metrics` endpoint, scrape-based, без vendor lock-in.
3. **Sentry для errors, НЕ для метрик** — не використовуємо Sentry Performance
   Monitoring як replacement для Prometheus histograms (ціна + semantic mismatch).
4. **SLI/SLO — код, не "best-practice PDF"** — burn-rate alert rules
   lives-commited-у репо.

---

## ADR-15.1 — Pino як єдиний логер, JSON у stdout

### Status

accepted.

### Context

Node-логери:

1. **console.log** — неструктуровані, нельзя тегувати, нельзя фільтрувати.
2. **winston** — прив'язка до npm, file-transport.
3. **pino** — JSON-first, швидкий (async write), native-support для child-loggers,
   ALS-context injection.

На Railway логи ingest-аються зі stdout у JSON-форматі без конфігурації.

### Decision

**Pino з JSON output у stdout.** Default log level: `info` у проді, `debug`
локально. ALS-context (`requestId`, `userId`, `module`) auto-inject-иться
через `requestContext.ts` middleware.

```ts
logger.info({ module: "sync", op: "push" }, "sync push received");
// Output: {"level":"info","time":..., "requestId":"x", "userId":"u",
//          "module":"sync","op":"push","msg":"sync push received"}
```

Child-logger pattern:

```ts
const log = logger.child({ module: "finyk" });
log.info({ txId }, "processed transaction");
```

### Consequences

**Позитивні:**

- Railway stdout → one unified stream. Можна grep-ати через `railway logs`.
- JSON — structured search у майбутньому (Loki/Grafana або OpenObserve).
- ALS-context — без пропагандації `requestId` через кожен function-signature.
- Швидкий (~10x console.log per op).

**Негативні:**

- Локально JSON нечитабельний → dev-помічник `pino-pretty` у scripts.
- Потрібна дисципліна: `logger.info({ ...structuredFields }, "message")`,
  не `logger.info(\`message with ${interpolated}\`)`. Це інколи пропускають —
  code-review ловить.

### Alternatives considered

- **console.log + Railway text parsing.** Без structured fields — неможливо
  filter by module/user. Відкинуто.
- **winston.** Синхронний за замовчуванням, drop-in для Pino не потрібен.
  Відкинуто.
- **Fluentd / log-shipper у Railway.** Overkill для нашого обсягу.

### Exit criteria

Переглядається, якщо ingest-tool (Loki, OpenObserve, etc) додаємо — тоді
перевіряємо, що JSON shape сумісний з його schema-експектаціями.

---

## ADR-15.2 — Prometheus як primary metrics layer

### Status

accepted.

### Context

Варіанти for metrics:

1. **Custom TSDB (InfluxDB, Timescale).** Vendor lock-in, extra infra.
2. **Sentry Performance.** Payment-per-transaction, semantic mismatch
   (транзакції ≠ operations, histogram-rollup стиль чужий).
3. **Prometheus.** Текстовий `/metrics` endpoint, scrape-based, open-source,
   Grafana-ecosystem. Histograms з buckets — саме те, що треба для p95/p99 SLO.
4. **OpenTelemetry metrics.** Vendor-agnostic, але додає bootstrap-складність;
   на нашому масштабі Prometheus-client працює ідентично без OTel overhead.

### Decision

**Prometheus-first.** `apps/server/src/obs/metrics.ts` реєструє counters/histograms,
`GET /metrics` endpoint експортує register-default-метрики + custom.
Authенtication — bearer `METRICS_TOKEN` env (дефолтна конвенція Prometheus scrape
у Railway).

Наш core metric-set:

| Metric                                                     | Type      | Labels                             | Мета                    |
| ---------------------------------------------------------- | --------- | ---------------------------------- | ----------------------- |
| `http_requests_total`                                      | counter   | method, path, status, module       | RED requests            |
| `http_request_duration_ms`                                 | histogram | method, path, status_class         | RED latency             |
| `http_errors_total`                                        | counter   | method, path, status_class, module | RED errors              |
| `db_query_duration_ms`                                     | histogram | op                                 | Postgres latency        |
| `db_pool_waiting`                                          | gauge     | -                                  | pg-pool saturation      |
| `sync_operations_total`                                    | counter   | op, module, outcome                | CloudSync SLI           |
| `sync_duration_ms`                                         | histogram | op, module                         | Sync latency            |
| `auth_attempts_total`                                      | counter   | op, outcome                        | Auth SLI                |
| `auth_session_lookup_duration_ms`                          | histogram | outcome                            | Session hot-path        |
| `ai_requests_total`                                        | counter   | endpoint, outcome                  | AI SLI                  |
| `ai_request_duration_ms`                                   | histogram | endpoint                           | AI latency              |
| `chat_tool_invocations_total`                              | counter   | tool, outcome                      | ADR-0002 tool lifecycle |
| `anthropic_prompt_cache_hit_total`                         | counter   | version, outcome                   | ADR-2.7                 |
| `external_http_requests_total`                             | counter   | upstream, outcome                  | Monobank/OFF/USDA       |
| `rate_limit_hits_total`                                    | counter   | key, outcome                       | Rate-limit              |
| `ai_quota_blocks_total` / `ai_quota_fail_open_total`       | counter   | reason                             | Quota enforcement       |
| `unhandled_rejections_total` / `uncaught_exceptions_total` | counter   | -                                  | Hard process-level      |

### Consequences

**Позитивні:**

- Ціна — $0 (Prometheus client — FOSS). Scrape-infra можна розгорнути, коли
  потрібно.
- Повний контроль над label-cardinality — не маємо per-user labels (уникає
  series explosion).
- Histogram-buckets вибрані під наші latency-pattern-и (5ms–10s).
- Алерти як код — `prometheus/alert_rules.yml` commited.

**Негативні:**

- Треба scrape-інфраструктуру (Prometheus server) — на MVP немає, метрики живі
  в пам'яті процесу, pull-scrape робиться ad-hoc. Треба Grafana Cloud або
  self-hosted Prometheus на Phase 2.
- Singleton register — не працює з multi-instance horizontal scaling без
  aggregation gateway. ADR-0009 §Open question: multi-instance зараз не
  активне.

### Alternatives considered

- **Sentry Performance.** Не дає burn-rate alerts, дорожче, дублює logs.
- **OpenTelemetry (OTel).** Overkill зараз, але простий migration-шлях у
  майбутньому (prom-client → otel-metrics).
- **Datadog.** Ціна + vendor-lock.

### Exit criteria

- Multi-instance деплой → потребує Pushgateway або OTel Collector.
- Scrape-інфра — окремий PR на self-host Prometheus чи Grafana Cloud hook-up.

---

## ADR-15.3 — Sentry тільки для errors, не для performance

### Status

accepted.

### Context

Sentry має два основні сервіси:

1. **Error tracking** — ловить unhandled exceptions, групує у «issues»,
   breadcrumbs, release tracking.
2. **Performance monitoring** — transactions, spans, auto-instrumentation.

Performance у Sentry — привабливо (auto-capture), але:

- Платна per-transaction модель (кожен запит = транзакція).
- Sampling-політика складна (head-sampling vs tail, для наших error-budget-ів
  не підходить).
- Семантичний mismatch: Sentry-«transaction» ≠ наш логічний op (sync push, AI call).

### Decision

- **Server Sentry** ([`apps/server/src/sentry.ts`](../../apps/server/src/sentry.ts))
  — тільки error capture (`captureException` з `err.cause`-ланцюжком).
- **Client Sentry** ([`apps/web/src/core/observability/sentry.ts`](../../apps/web/src/core/observability/sentry.ts))
  — error capture + navigation breadcrumbs. `tracesSampleRate = 0` (performance
  вимкнено).
- **Performance = Prometheus** (server) + **Web Vitals beacons** (client, окрема
  секція).

### Consequences

**Позитивні:**

- Sentry-ціна = low tier (лише errors).
- Чіткий поділ: error → Sentry; performance → Prometheus; logs → Pino.
- Release tracking — корисний для розрізнення «error з'явився у vX.Y».

**Негативні:**

- Клієнтський performance — окреме Web Vitals tracking, не в Sentry UI. Для
  нас ok, бо ми хочемо server-side аггрегацію, не Sentry dashboards.

### Alternatives considered

- **Sentry Performance як replacement Prometheus.** Відкинуто (price, semantic).
- **Self-host error tracker (GlitchTip).** Open-source Sentry-сумісний. Можливий
  в майбутньому. Поки SaaS-Sentry ок.

### Exit criteria

Переглядається, якщо Sentry ціна стане > \$50/міс для errors (unlikely на наших
volumes).

---

## ADR-15.4 — SLO-first alerting, burn-rate не threshold

### Status

accepted.

### Context

Traditional alert style: `5xx rate > 1% for 5min → page`. Проблеми:

- Arbitrary threshold (чому 1%?).
- Flaky (невеликий спайк під час deploy → false positive page).
- Не пов'язано з user-facing SLA (1% за 5min може бути ок, якщо SLO-бюджет
  не вигорає).

Alternative: Google SRE Workbook Ch.5 — multi-window multi-burn-rate:

- Fast burn (1h + 5m): якщо за годину вигорить ~2% місячного бюджету → page.
- Slow burn (6h + 30m): повільна деградація → ticket.

### Decision

**SLO + burn-rate alerts** для кожного критичного домена. Реалізовано у
[`prometheus/alert_rules.yml`](../observability/prometheus/alert_rules.yml) +
визначено у [`docs/observability/SLO.md`](../observability/SLO.md):

| Домен          | SLO    | Fast burn alert | Slow burn alert |
| -------------- | ------ | --------------- | --------------- |
| HTTP API       | 99.0 % | 14.4× × (1-SLO) | 6× × (1-SLO)    |
| Sync           | 99.5 % | як HTTP         | як HTTP         |
| Auth           | 99.0 % | як HTTP         | як HTTP         |
| AI (Anthropic) | 97.0 % | як HTTP         | як HTTP         |

Для latency — простий threshold (`p95 > 1000ms for 15m`), бо burn-rate на
histogram рахувати дорого і sensitive-до-bucket-вибору.

Process-рівня hard alerts без SLO — `unhandled_rejections_total` +
`uncaught_exceptions_total` (див.
[`SLO.md#7-process`](../observability/SLO.md#7-process-рівня-не-slo-hard-alerts)).

### Consequences

**Позитивні:**

- Алерти корелюють з user-impact, а не з arbitrary-threshold-ом.
- Fast burn → справжній інцидент (треба page on-call); slow burn → follow-up
  ticket, не будити вночі.
- Алерти як код → review-аються через PR.

**Негативні:**

- Складніший mental model для нової людини. Runbook
  ([`docs/observability/runbook.md`](../observability/runbook.md)) пояснює.
- Потрібна достатня traffic, щоб SLI був stable — на low-traffic періоди
  burn-rate може flap-ити. Мітігація: min sample threshold у PromQL
  (`... and sum(rate(...)) > 0.1`).

### Alternatives considered

- **Static thresholds для всього.** Простіше, але не пов'язано з SLA і flaky.
- **Sentry alert rules.** Працюють для error-rate, але не для sync-outcome чи
  AI-latency окремо.

### Exit criteria

n/a.

---

## ADR-15.5 — Request context через AsyncLocalStorage

### Status

accepted.

### Context

`requestId`, `userId`, `module` потрібні у кожному log-entry. Варіанти пропагандації:

1. Через параметр кожної функції — verbose, error-prone.
2. Global singleton — breaks concurrency (два requesta перетираються).
3. AsyncLocalStorage (ALS) — Node's `async_hooks` continuation-local storage,
   safe для concurrent requests.

### Decision

ALS у `apps/server/src/obs/requestContext.ts`. Middleware `withRequestContext`
виставляє `{ requestId, userId, module }` на початку request-а. `logger.child()`
автоматично includes ці fields. Domain-код може викликати
`runWithModule("finyk", () => { ... })` для явного scoping.

### Consequences

**Позитивні:**

- Log entry завжди tagged — grep працює elegantly.
- Без dev-noise — функції не несуть `requestId` у signature.

**Негативні:**

- ALS має performance overhead (~5-10% на call), зразу додається для всього.
  Для low-traffic apps — прийнятно.

### Exit criteria

n/a.

---

## ADR-15.6 — Web Vitals (client-side)

### Status

accepted.

### Context

Для web-UX важливі Core Web Vitals (LCP, INP, CLS). Google PageSpeed / CrUX
показують aggregate, але не корелюють з нашими code-changes. Треба інструмент
у runtime.

### Decision

[`apps/web/src/core/observability/webVitals.ts`](../../apps/web/src/core/observability/webVitals.ts)
використовує `web-vitals` package і шле beacon у `/api/web-vitals` endpoint.
Сервер агрегує у Prometheus histogram:

- `web_vitals_lcp_ms_bucket`
- `web_vitals_inp_ms_bucket`
- `web_vitals_cls_count`

Grafana панелі поруч із server-side метриками для holistic picture.

### Consequences

**Позитивні:**

- Реальне user-perceived performance з production traffic.
- Регресії на UX-metric-ах ловляться на PR preview (порівняти dashboard).

**Негативні:**

- Beacon трафік — кілька payload-ів на page-load. Мінімальний impact.

### Exit criteria

n/a.

---

## ADR-15.7 — Зони відповідальності: logs vs metrics vs errors

### Status

accepted.

### Decision

Жорсткий принцип: **один домен — один observability-шар**. Не дублювати.

| Що хочемо дізнатися                          | Куди дивимось             |
| -------------------------------------------- | ------------------------- |
| Чому конкретний request-a 500-їтся           | Pino (`requestId` filter) |
| Як часто цей path падає                      | Prometheus (counter)      |
| Нова exception з'явилась у релізі            | Sentry (issues view)      |
| p95 latency регресії                         | Prometheus (histogram)    |
| Що юзер робив до помилки                     | Sentry breadcrumbs        |
| Скільки грошей спалили на Anthropic сьогодні | Prometheus (`ai_*`)       |
| Чи burn-rate перейшов SLO                    | Prometheus alert rule     |

Антипатерн: "дублювати error у Pino + Sentry + Prometheus counter". Правило —
error → Sentry (з `err.cause`); Prometheus counter інкрементується для rate-
aggregation (`http_errors_total`); Pino пише log з `level=error` і повним context-ом.
Якщо шукаємо "why just now X", Pino; "trend X", Prometheus; "what class of error",
Sentry.

### Consequences

- Один source of truth на запитання → менше confusion.
- Debuging flow чіткий: runbook цитує конкретний шар для конкретного алерту.

### Exit criteria

n/a.

---

## Open questions

1. **Scrape-інфра.** Де живе Prometheus server? Self-host на Railway як окремий
   сервіс, або Grafana Cloud free tier? Поки `/metrics` scrape-иться ad-hoc.
2. **Log-retention.** Railway тримає stdout ~7 днів. Для audit-запитів глибших
   треба log-shipper (Loki / OpenObserve). TBD — залежить від compliance-вимог.
3. **Multi-instance metrics.** ADR-0009 open question: коли йдемо на ≥ 2
   instances, треба Pushgateway або OTel Collector як metrics-fanin.
4. **Client-side error context.** Sentry breadcrumbs дають navigation/click,
   але не React-state. Розгляд — додати Redux-devtools-style snapshot у
   breadcrumb, якщо складні bug-и не відтворюються.

---

## Implementation tracker

| Arte-fact                                        | Статус |
| ------------------------------------------------ | ------ |
| Pino logger з ALS-context                        | live   |
| Prometheus metric set (HTTP, DB, Auth, Sync, AI) | live   |
| `/metrics` bearer-token endpoint                 | live   |
| SLO.md з SLI формулами і burn-rate alert rules   | live   |
| Grafana dashboards стартер-пак                   | live   |
| Runbook для кожного алерту                       | live   |
| Client Sentry + server Sentry                    | live   |
| Web Vitals beacons + Prometheus аггрегація       | live   |
| Self-hosted Prometheus (або Grafana Cloud)       | TBD    |
| Log-shipper для retention > 7 днів               | TBD    |
| Multi-instance metric aggregation                | TBD    |
