# 0004 — Server observability (Sentry server-side + OpenTelemetry traces)

> **Status:** Proposed
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
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration(), Sentry.postgresIntegration()],
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
  export function aiSpan<T>(name: string, fn: () => Promise<T>, attrs: { model: string; provider: string }): Promise<T>;
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

| Ризик                                                              | Мітигація                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| OTEL SDK додає overhead на кожен запит                             | `tracesSampleRate = 0.1` for GET. Замір p99 до/після — якщо +5% і більше — знизити sample або відключити `pg` instrumentation. |
| Sentry "PII leak" через request-payloads                           | Включити `Sentry.maskAllInputs()` + denylist headers (`authorization`, `cookie`). Перевірити sample event у dev перед prod. |
| Grafana Cloud Tempo cost spike                                     | Stick-to 10% sample for GET. Quota alarm на $50/міс — Telegram ping.                                              |
| AI-spans засвічують tokens prompts → leak у logs                  | `aiSpan` записує тільки **size** (chars/tokens), а не зміст. Контент prompts **не пишемо** у span attributes.     |
| `Sentry.errorHandler` ловить вже залогований Pino-error → дубль   | Pino logger тег `sentryHandled = true` після Sentry.captureException, не повторювати у Pino.                      |

## Метрики

| Метрика                                                  | Baseline (2026-05-03) | Target (post-rollout)        |
| -------------------------------------------------------- | --------------------- | ---------------------------- |
| Server-side error events / day у Sentry                  | 0                     | every real error captured    |
| % requests із trace-id у logs                            | ~0                    | 100%                         |
| Grafana panels live для server                           | 2 (Pino + Prom лише)  | 8                            |
| MTTR при p1 інциденті                                    | ?                     | < 30 хв (з spans + alerts)   |
| `tracesSampleRate` config drift between Sentry / OTEL    | n/a                   | exactly 1.0 / known ratio    |

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

## Outcome

_Заповнюється після завершення._
