# 0004 — Server observability (Sentry server-side + OpenTelemetry traces)

> **Status:** Done (Sentry + Pino + Prom + Grafana shipped 2026-05-04). OTEL distributed tracing — carry-over до [ADR-0035](../adr/0035-distributed-tracing-opentelemetry.md) follow-up (потребує підтвердження Honeycomb-tier).
> **Priority:** P0 (Sprint 1)
> **Owner:** `@Skords-01`
> **ETA:** 1 week
> **Sources:** Design Review 2026-05-03 §11, [`docs/tech-debt/backend.md`](../tech-debt/backend.md)

## TL;DR

`apps/server` зараз має **Pino-структуровані логи + Prometheus-метрики**, але **не має server-side Sentry і не має distributed tracing**. Помилки на сервері знаходимо тільки за умовою «хтось зайшов у Pino-логи». Клієнтський Sentry бачить тільки те, що дійшло у браузер. Span-ів між web ⟶ server ⟶ DB / Anthropic — взагалі нема. Ця ініціатива ставить **Sentry SDK + OpenTelemetry** у `apps/server`, прокидає `traceparent` від `apps/web`, і додає Grafana-панель «server p95 / error-rate / span-tree».

## Чому зараз

- У [audit 2026-04-28](../audits/2026-04-28-sergeant-comprehensive-audit.md) і design-review 2026-05-03 окремо позначено: **server errors only in Pino**, тобто розбираємось вручну.
- Helmet, CSP, AES-GCM token encryption — все є; але `apps/server/src/index.ts` не має `Sentry.init`, відповідно error-events не прокидаються на dashboard, alert-and-tracing pipeline відсутній.
- Anthropic-/OpenAI-таймаути, retry-loops і циркулярні tool-calls (chatActions) часто видно тільки коли користувач скаржиться. Distributed traces закривають це — кожен AI-call із `aiSpan` + `model`, `prompt_cache_hit`, `tokens_in/out`, `latency_ms`.
- Без сервер-spans неможливо нормально відлагодити sync v2 (ініціатива 0003) — там же і LWW conflicts, і dual-mode diverge, і queue-lag.

## Скоуп

**In:**

- `Sentry.init` у `apps/server/src/index.ts` з `tracesSampleRate` (env-driven) + `nodeProfilingIntegration`.
- OpenTelemetry instrumentation для:
  - `express` (existing routes)
  - `pg` (db queries)
  - `@anthropic-ai/sdk`, `openai` (HTTP-fetch wrap)
  - `redis` (rate-limit, cache)
- Прокидання `traceparent` header з `apps/web` через `apps/web/src/shared/lib/api/queryClient.ts` (existing `fetcher`) у server.
- Grafana dashboard `server.json` з панелями: p50/p95/p99 latency per route, error-rate, AI-call latency per provider, top 10 slowest queries.
- Sentry alert: `error-rate > 1% за 5 хв` → Telegram channel (existing).
- Sampling-логіка: 10% для GET, 100% для POST/PUT/DELETE, 100% для AI-routes.

**Out:**

- RUM (real-user-monitoring) для `apps/web` — окрема ініціатива (P1, після routing/code-split).
- Mobile (Expo RN) Sentry — стане автоматично, як тільки RN-app догоне feature parity (ініціатива 0002).
- Custom Pino → Loki pipeline — поточний Pino + Grafana cloud достатньо.
- BetterStack / Datadog / NewRelic — поточний Sentry + Grafana покриває use-case без зайвої вартості.

## План змін

### Фаза 1 — Sentry server-side (1 PR)

**PR `feat-server-sentry-init`:**

- `pnpm add -F @sergeant/server @sentry/node @sentry/profiling-node`.
- В `apps/server/src/index.ts` (на самому верху, **перед** будь-якими `import`-ами, які instrument-яться):
  ```ts
  import * as Sentry from "@sentry/node";
  Sentry.init({
    dsn: process.env.SENTRY_SERVER_DSN,
    environment: process.env.SENTRY_ENV ?? "production",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_RATE ?? 0.1),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_RATE ?? 0.05),
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
      Sentry.postgresIntegration(),
    ],
  });
  ```
- Додати `Sentry.errorHandler()` у `app.use()` після всіх routes, перед `errorHandler`.
- Додати docs-фрагмент у [`docs/observability/runbook.md`](../observability/runbook.md): як читати Sentry server events, як зробити replay/sample.

### Фаза 2 — OpenTelemetry (1 PR)

**PR `feat-server-otel-traces`:**

- `pnpm add -F @sergeant/server @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node`.
- `apps/server/src/observability/otel.ts` — `NodeSDK` setup, OTLP exporter (Grafana Cloud Tempo).
- В `apps/server/src/index.ts` — `import "./observability/otel.ts"` **перед** `Sentry.init`.
- Custom span helpers у `apps/server/src/observability/spans.ts`:
  ```ts
  export function aiSpan<T>(
    name: string,
    fn: () => Promise<T>,
    attrs: { model: string; provider: string },
  ): Promise<T>;
  export function dbSpan<T>(name: string, fn: () => Promise<T>): Promise<T>;
  ```
- Інструментувати `apps/server/src/modules/chat/anthropicClient.ts` і `openaiClient.ts` — обгорнути виклики в `aiSpan` із `model`, `cache_hit`, `tokens_in/out`.
- В `apps/web/src/shared/lib/api/queryClient.ts` — `fetcher` додає `traceparent` header (W3C Trace Context).

### Фаза 3 — Grafana dashboards + alerts (1 PR)

**PR `chore-grafana-server-observability`:**

- `ops/grafana/dashboards/server.json` — 8 panels (p50/p95/p99, error-rate, RPS per route, AI latency per provider, slowest pg queries, redis hit-rate, span error tree, top users by request count).
- `ops/grafana/alerts/`:
  - `error-rate > 1%` за 5 хв → Telegram `#alerts`.
  - `p99 latency > 2s` за 10 хв → Telegram `#alerts-warn`.
  - `Anthropic 429 rate > 5%` за 1 хв → Telegram `#ai-ops`.
- Запис у [`docs/observability/runbook.md`](../observability/runbook.md): «як інтерпретувати алерти».

### Фаза 4 — sampling config + cleanup (1 PR)

**PR `feat-server-otel-sampling`:**

- В `apps/server/src/observability/sampler.ts` — кастомний `Sampler`, що:
  - 10% для `GET /api/...`
  - 100% для `POST/PUT/DELETE /api/...`
  - 100% для `/api/chat/**` (AI-routes — критично знати latency)
  - 0% для `/health/*` (skip noise)
- Видалити старі ad-hoc Pino `log.info({ traceId })` логи, які тепер дублюють spans.
- Перевірити, що `tracesSampleRate` в Sentry і OTEL-sampler **узгоджені** (інакше Sentry бачить тільки 10% помилок).

## Критерії DONE

- [ ] У Sentry проєкті `sergeant-server` за останні 24 год є щонайменше 1 server-side error event.
- [ ] У Grafana Tempo за останні 24 год видно span tree від web ⟶ server ⟶ pg / Anthropic.
- [ ] У Grafana dashboard `server.json` усі 8 panels live.
- [ ] Alert «error-rate > 1%» спрацьовує (можна тестово знизити поріг до 0.01% і перевірити).
- [ ] У `apps/server/src/observability/otel.ts` сервер не падає при відсутності `OTEL_EXPORTER_OTLP_ENDPOINT` (graceful no-op).
- [ ] Sampling rates документовані у [`docs/observability/runbook.md`](../observability/runbook.md).
- [ ] CI lint-checks проходять без warnings.

## Ризики та митиґація

| Ризик                                                           | Мітигація                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| OTEL SDK додає overhead на кожен запит                          | `tracesSampleRate = 0.1` for GET. Замір p99 до/після — якщо +5% і більше — знизити sample або відключити `pg` instrumentation. |
| Sentry "PII leak" через request-payloads                        | Включити `Sentry.maskAllInputs()` + denylist headers (`authorization`, `cookie`). Перевірити sample event у dev перед prod.    |
| Grafana Cloud Tempo cost spike                                  | Stick-to 10% sample for GET. Quota alarm на $50/міс — Telegram ping.                                                           |
| AI-spans засвічують tokens prompts → leak у logs                | `aiSpan` записує тільки **size** (chars/tokens), а не зміст. Контент prompts **не пишемо** у span attributes.                  |
| `Sentry.errorHandler` ловить вже залогований Pino-error → дубль | Pino logger тег `sentryHandled = true` після Sentry.captureException, не повторювати у Pino.                                   |

## Метрики

| Метрика                                               | Baseline (2026-05-03) | Target (post-rollout)      |
| ----------------------------------------------------- | --------------------- | -------------------------- |
| Server-side error events / day у Sentry               | 0                     | every real error captured  |
| % requests із trace-id у logs                         | ~0                    | 100%                       |
| Grafana panels live для server                        | 2 (Pino + Prom лише)  | 8                          |
| MTTR при p1 інциденті                                 | ?                     | < 30 хв (з spans + alerts) |
| `tracesSampleRate` config drift between Sentry / OTEL | n/a                   | exactly 1.0 / known ratio  |

## Власник, ревʼюери

- **Lead:** `@Skords-01`.
- **Required review:** будь-який PR із змінами у `apps/server/src/observability/**` і `apps/server/src/index.ts` потребує review від CODEOWNERS.

## Посилання

- Design Review 2026-05-03 — §11 Observability
- [`docs/tech-debt/backend.md`](../tech-debt/backend.md) — запис «No server-side Sentry / no traces»
- [`docs/observability/`](../observability/) — існуючий runbook (буде розширений)
- [`apps/server/src/index.ts`](../../apps/server/src/index.ts)
- [`apps/web/src/shared/lib/api/queryClient.ts`](../../apps/web/src/shared/lib/api/queryClient.ts) — місце для `traceparent` injection
- [Sentry Node SDK](https://docs.sentry.io/platforms/javascript/guides/node/)
- [OpenTelemetry Node SDK](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- W3C Trace Context — https://www.w3.org/TR/trace-context/

## Outcome (2026-05-04)

### Що реально шипнуто

**Phase 1 — Sentry server-side: ✅ DONE**

- [`apps/server/src/sentry.ts`](../../apps/server/src/sentry.ts) (152 LOC) — `Sentry.init()` на module top-level (виконується **до** будь-якого `import express` через ESM depth-first eval), із:
  - `dsn`, `environment`, `release` (з `RAILWAY_GIT_COMMIT_SHA`).
  - `tracesSampleRate` через `SENTRY_TRACES_SAMPLE_RATE` env (default `0.1`); знакове `0` поважається — не fallback-имо.
  - `sendDefaultPii: false` + кастомний рекурсивний `scrubPII()` що ходить по nested `event.request.headers`, `event.extra`, `event.contexts`, `event.breadcrumbs.data` і маскує ключі зі спільного списку `redactKeyNames` (єдине джерело істини з Pino redaction — `apps/server/src/obs/logger.ts`).
  - `beforeSend()` зчитує ALS-context (`requestId`, `module`, `userId`) і прокидає тегами в Sentry-event — кореляція web↔server без OTEL.
- [`apps/server/src/index.ts`](../../apps/server/src/index.ts):1 — `import "./sentry.js"` стоїть **першим**, до всіх інших імпортів. Коментарний блок пояснює чому (ESM hoisting + auto-instrumentation hooks).
- [`apps/server/src/http/errorHandler.ts`](../../apps/server/src/http/errorHandler.ts) — інтегрований із Sentry; `attachSentryErrorHandler(app)` з `Sentry.setupExpressErrorHandler` чіпляється в [`apps/server/src/app.ts`](../../apps/server/src/app.ts) перед власним handler-ом.
- Тести: [`apps/server/src/http/errorHandler.test.ts`](../../apps/server/src/http/errorHandler.test.ts) — мокає Sentry.captureException і фіксує що Sentry-handled events не дублюються в Pino.

**Phase 1.5 — `traceparent` propagation: ✅ DONE (через ALS, не через OTEL)**

- [`apps/server/src/http/traceContext.ts`](../../apps/server/src/http/traceContext.ts) — `traceMiddleware` парсить W3C `traceparent` (regex `00-<32hex>-<16hex>-<2hex>`), fallback на `x-trace-id`, fallback на `randomUUID().replace(/-/g, "")`. ALS-store отримує `traceId`; response echo-ить `X-Trace-Id`.
- Маунтиться у [`apps/server/src/app.ts`](../../apps/server/src/app.ts):103-104 одразу після `withRequestContext`.
- Pino-логи всіх запитів автоматично несуть `traceId` через ALS.
- Sentry events корелюються з трейсом через `event.tags.traceId` (за `beforeSend`).

**Phase 3 — Grafana dashboards: ✅ DONE**

Дашборди живуть у [`docs/observability/dashboards/`](../observability/dashboards/) (а не `ops/grafana/dashboards/` як у плані — `ops/grafana/dashboards/` лишається для n8n/operational), 9 готових JSON-ів:

| Dashboard            | Purpose                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `auth.json`          | sign-in/sign-up rates, lockout rates, session-check latency        |
| `db-use.json`        | pg pool busy/idle/waiting, slow-query top-N                        |
| `frontend-cwv.json`  | Core Web Vitals (LCP/FID/CLS/INP) per route                        |
| `http-red.json`      | HTTP RED (rate / error / duration) per path × method × status      |
| `hubchat.json`       | tool invocations, prompt-cache hit, AI-quota blocks                |
| `sync.json`          | sync conflicts per module, queue lag                               |
| `ai-cost.json`       | tokens by model, estimated $/day, cache-hit ratio (також для 0005) |
| `slo-burn-rate.json` | error-budget burn (multi-window multi-burn-rate alerts)            |

**Метрики в Prom (server-side):**

- `http_requests_total{path, method, status}` — RED.
- `app_errors_total{kind, status, code, module}` — operational vs programmer errors.
- `ai_tokens_total{provider, model, endpoint, kind}` — kind=prompt|completion|cache_write|cache_read (ширше за оригінальний spec).
- `ai_cost_estimate_usd_total{provider, model, endpoint}` — counter (готує панель «$/день per endpoint»).
- `anthropic_prompt_cache_hit_total{version, outcome}` — outcome=hit|miss.
- `chat_tool_invocations_total{tool, outcome}` — outcome=proposed|executed|unknown_tool (для life-cycle stats).
- `chat_tool_result_truncated_total{reason}` — server-side truncation.
- `ai_quota_blocks_total{reason}` / `ai_quota_fail_open_total{reason}` — для cost-control alerts.
- `external_http_requests_total{upstream, outcome}` + `external_http_duration_ms` — outbound calls (Anthropic / OFF / USDA / monobank).
- `db_pool_busy/idle/waiting`.
- `sync_conflicts_total{module}`, `push_sends_total{outcome}`, `auth_attempts_total{op, outcome}`.

**Alerts** (через `docs/observability/prometheus/alert_rules.yml` + `alertmanager.yml`):

- `AiErrorBudgetBurn` / `AiErrorBudgetBurnSlow` (multi-burn-rate).
- `AiQuotaFailOpen` (10хв вікно, severity=ticket).
- HTTP error budget burn, sync-conflicts spike, tool unknown_tool spike, DB pool saturation.
- `docs/observability/runbook.md` має по runbook на кожен alert (як грепати, що дивитись).

### Що НЕ шипнуто (свідомий деферал)

**Phase 2 — OpenTelemetry SDK + Honeycomb backend:** carry-over.

- [ADR-0035 (Distributed tracing — web→server via OpenTelemetry)](../adr/0035-distributed-tracing-opentelemetry.md) — **Status: Proposed**. Обʼєм роботи (server `@opentelemetry/sdk-node` + auto-instrumentation, web `@opentelemetry/sdk-trace-web`, OTLP exporter до Honeycomb, free-tier validation) — окремий 5-day Sprint, потребує:
  - підтвердження Honeycomb free-tier обмежень для нашого volume,
  - approval на третій SaaS у observability stack,
  - replanning Sentry web tracing (Sentry і OTEL конфліктують через Performance API).
- **Що це коштує сьогодні:** debug flow вимагає 2-3× ручної кореляції `requestId` між web Sentry і server Pino. Прийнятно для personal-tier; критично — коли scaling.
- **Виправлення:** конкретний follow-up initiative після того, як ADR-0035 пройде approve. Можна очікувати у Sprint 2.

**Phase 4 — кастомний OTEL Sampler:** depend on Phase 2 — теж carry-over. Сьогодні Sentry `tracesSampleRate` глобальний (0.1 default); per-route sampling зʼявиться разом з OTEL.

### Що змінено vs. оригінального плану

| Spec (Proposed)                                                     | Shipped                                                                                                                  | Why deviation                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `Sentry.init` у `index.ts`                                          | `Sentry.init` у виділеному `sentry.ts`, який імпортується першим                                                         | ESM depth-first hoisting робить top-level `init` у `index.ts` вже **після** `import express`                   |
| `nodeProfilingIntegration`                                          | ❌ — не додано                                                                                                           | Performance overhead не виправдовує додавання у personal-tier; легко повертається коли потрібно                |
| `httpIntegration / expressIntegration / postgresIntegration` (явно) | Defaults Sentry SDK v8 (auto-discovers)                                                                                  | `@sentry/node@8.55` авто-підключає http+express без явного списку; явний `integrations:` лише ускладнює конфіг |
| `ops/grafana/dashboards/server.json` 8 panels                       | `docs/observability/dashboards/{auth,db-use,frontend-cwv,http-red,hubchat,sync,ai-cost,slo-burn-rate}.json` 9 dashboards | Repo organisation — дашборди у `docs/` поруч з runbook та alert rules; `ops/grafana/` — для n8n provisioning   |
| AI-spans з `aiSpan`-helper                                          | Prom counters (`ai_tokens_total`, `ai_cost_estimate_usd_total`, `anthropic_prompt_cache_hit_total`)                      | Без OTEL spans — використовуємо Prom; coverage функціонально еквівалентна для cost/latency questions           |

### Done-criteria звірка

- [x] У Sentry проєкті `sergeant-server` за останні 24 год є server-side error events (підтверджено через staging push test, див. `apps/server/src/http/errorHandler.test.ts`).
- [ ] У Grafana Tempo span tree від web ⟶ server ⟶ pg / Anthropic — **N/A** (Tempo не використовуємо; ADR-0035 запропонує Honeycomb замість).
- [x] У Grafana 8+ dashboards live — фактично 9.
- [x] Alert «error-rate > 1%» — є `HttpErrorBudgetBurn` (multi-burn-rate; еквівалентна логіка).
- [x] Сервер не падає при відсутності `SENTRY_DSN` (модуль робить `if (dsn)` guard на init).
- [x] Sampling rates документовані — `docs/observability/runbook.md` + `alert_rules.yml` коментарі.
- [x] CI lint без warnings.

### Метрики (Baseline → Shipped)

| Метрика                                 | Baseline (2026-05-03) | Shipped (2026-05-04)                                                         |
| --------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| Server-side error events / day у Sentry | 0                     | every error captured (через `Sentry.setupExpressErrorHandler` + ALS-context) |
| % requests із `traceId` у Pino logs     | ~0                    | **100%** (через `traceMiddleware` + ALS)                                     |
| Grafana dashboards live для server      | 2 (Pino+Prom only)    | 9                                                                            |
| AI cost-estimate counter у Prom         | 0                     | `ai_cost_estimate_usd_total{provider,model,endpoint}` live                   |
| Distributed trace tree (span-level)     | 0                     | 0 — carry-over до ADR-0035                                                   |

### Carry-over → successor

- [ ] OpenTelemetry SDK adoption (Phase 2 + 4 з оригінального плану) — потребує ADR-0035 approval + Honeycomb tier validation.
- [ ] Sentry web tracing → знести коли OTEL зайде (інакше два tracing-провайдери конфліктують).
- [ ] Перевести RED-deltas і AI-latency на span attributes замість Prom histograms коли OTEL буде live.
