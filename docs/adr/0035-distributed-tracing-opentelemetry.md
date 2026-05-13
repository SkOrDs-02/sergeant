# ADR-0035: Distributed tracing — web→server via OpenTelemetry

- **Status:** accepted
- **Date:** 2026-05-03 (proposed) / 2026-05-05 (accepted)
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0015](./0015-observability-stack.md) — observability stack (Pino + Prometheus + Sentry); цей ADR розширює його traces-шаром.
  - [`docs/observability/frontend.md`](../observability/frontend.md) §7 «Sentry-події не з'єднані» — поточний gap.
  - [`apps/server/src/obs/requestContext.ts`](../../apps/server/src/obs/requestContext.ts) — ALS-based request context (вже є `requestId`, але без trace propagation).
  - [`docs/audits/2026-04-28-sergeant-comprehensive-audit.md`](../audits/2026-04-28-sergeant-comprehensive-audit.md) §P3-2 — audit row.

---

## 0. TL;DR

**Прийнято ї реалізовано з vendor-agnostic-варіантом.** Сервер-side OTel SDK (NodeSDK + OTLP/HTTP exporter, route-aware sampler, Anthropic `aiSpan`-instrumentation, ALS-bridge для Pino-`traceId`) шипнуто 2026-05-05 у рамках ініціативи [0004 Phase 2 + 4](../initiatives/archive/_0004-server-observability.md). Відмінно від оригінальної пропозиції — не фіксуємо Honeycomb як єдиний backend, а приймаємо будь-який OTLP/HTTP collector через `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (Honeycomb / Grafana Cloud Tempo / self-hosted Tempo). Web-бок генерує W3C `traceparent` header вручну (без SDK у бандлі) — це закриває web→server correlation gap без +50KB gzip у веб. Sentry web tracing НЕ вимикаємо автоматично — після ввімкнення OTLP-endpoint оператор може виставити `SENTRY_TRACES_SAMPLE_RATE=0` ї явно (одна env-лінія, без код-змін). Final-backend вибір — окремо після volume-оцінки в prod-і (див. § 7.1 Implementation status).

---

## 1. Context and Problem Statement

Поточний дебаг flow при production-incident-і (з [ADR-0015](./0015-observability-stack.md)):

1. User скаржиться → Sentry web alert з `requestId` у breadcrumbs.
2. Grep серверних Pino-логів за цим `requestId` → знаходимо запит на сервері.
3. Grep server Sentry-альертів окремо → ручна корекція.

Проблеми:

- **Manual correlation** — кожен debug займає 2–3× довше, ніж trace із автозв'язком.
- **Lost spans між клієнт і сервер** — web-bound network trace (fetch + queue + parsing) і server-bound (DB + tools + Anthropic) — два окремі дерева. Cardinal questions ("де time йде у повільному /api/chat") вимагають reading both.
- **No mobile coverage** — Mobile RN навіть Sentry поки не має (Phase 10 не реалізовано). Distributed tracing підготує grunt-роботу для mobile observability.
- **Audit P3-2** — explicitly identified as gap.

`docs/observability/frontend.md:451` має TODO: «додати `x-request-id` header у fetch-клієнт». Half-fix — додати `requestId`. Full-fix — додати W3C `traceparent` (включає `requestId` як trace-id + parent span context).

---

## 2. Considered Options

### Backend (де trace-data live):

1. **Honeycomb** (вибрано в Decision) — purpose-built для traces, free tier 20M events/місяць (Sergeant-ferman volume <2M/місяць), strong UI для root-cause-analysis.
2. **Datadog APM** — тісніше interop із metrics/logs, але $31/host-місяць (~$31 × 2 hosts = $62/міс) — занадто на personal-tier.
3. **Sentry Performance Monitoring** — вже в стеку (server + web Sentry). Але цей шар coupled з error-tracking (semantic mismatch — perf data ≠ error data); експерт-querying (e.g., span-attributes filter) обмежений; підвищує Sentry volume → cost.
4. **Tempo (Grafana stack)** + self-hosted — open-source, але вимагає Grafana setup і storage. Поточний стек (Railway + Vercel) не має Grafana хоста; додавати — окремий ADR.
5. **OpenTelemetry Collector → AWS X-Ray** — vendor-agnostic, але X-Ray UI бідний для span-attributes-filter, query-language незвичний.

### Tracer SDK (як спрямувати):

1. **`@opentelemetry/api` + `@opentelemetry/sdk-node` (server)**, **`@opentelemetry/sdk-trace-web` + `@opentelemetry/instrumentation-fetch` (web)** (вибрано) — standard, ecosystem-aligned.
2. **Sentry's `Sentry.startSpan` API** — Sentry-locked, не portable. `sentry-trace` header не сумісний з W3C `traceparent`.
3. **Honeycomb Beelines** — Honeycomb-locked. Якщо колись міняємо backend — перепис весь instrumentation.

---

## 3. Decision

### 3.1. Backend: Honeycomb (free tier).

Rationale: free 20M events/міс >> наш volume; UI optimized для тестування root-cause questions; export через OTLP — vendor-agnostic, можна свопнути на іншого OTLP-приймача без переписування коду.

### 3.2. SDK: `@opentelemetry/*` packages.

**Server (`apps/server`):**

- `@opentelemetry/sdk-node` + auto-instrumentation: `@opentelemetry/instrumentation-express`, `@opentelemetry/instrumentation-pg`, `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-fetch` (для Anthropic outbound).
- Bootstrap у `apps/server/src/obs/tracing.ts` (нове), імпортується з `apps/server/src/index.ts` ПЕРЕД будь-яким Express-import-ом (otel-instrumentation hooks потребують raw require).
- Export: OTLP HTTP до Honeycomb (`OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io/v1/traces`).
- Sample rate: `OTEL_TRACES_SAMPLER=parentbased_traceidratio`, `OTEL_TRACES_SAMPLER_ARG=0.1` (10%).

**Web (`apps/web`):**

- `@opentelemetry/sdk-trace-web` + `@opentelemetry/instrumentation-fetch` для autoinstrument-у API-fetch-ів.
- Bootstrap у новому web-OTel-bootstrap файлі (планувалось `apps/web/src/core/observability/`), lazy-loaded як Sentry, щоб не тягти OTel-bundle у hot path. **У фінальній реалізації (див. § 7.1) web SDK не shipped — натомість manual W3C `traceparent` header injection без OTel-bundle у бандлі.**
- Export: OTLP HTTP до Honeycomb (через CORS-протокол, або через server-side proxy `/api/internal/traces`).
- Sample rate: 0.05 (5%, less than server бо browser volume вище).

### 3.3. Sentry tracing на web вимикаємо.

`browserTracingIntegration` несумісний з OTel — обидва намагаються wrap-нути global `fetch` і одне з них програє. OTel виграє за стандарт W3C, Sentry-tracing вимикаємо: `VITE_SENTRY_TRACES_SAMPLE_RATE=0`.

Sentry **error tracking** залишається — окремий, не tracing.

### 3.4. Trace propagation.

W3C `traceparent` header авто-додається `instrumentation-fetch` на клієнті, авто-парситься `instrumentation-express` на сервері. Span context auto-propagates через `@opentelemetry/api` → `context.with(...)` → колбеки. Pino bindings (`apps/server/src/obs/requestContext.ts`) розширюємо: `traceId` + `spanId` як structured field у JSON-логах. Тоді grep по trace-id у логах не потрібен — Honeycomb сам collate-ить.

### 3.5. Mobile (`apps/mobile`).

Out of scope для цього ADR. Coverage Phase 10. Decision-point: чи робити OTel перед Sentry-mobile, чи паралельно.

---

## 4. Rationale

**Чому OTel, не Sentry-locked tracing:**

OTel — open standard W3C. Якщо Honeycomb передумаємо — swappable на Tempo/Jaeger/X-Ray без code changes (тільки env var). Sentry tracing locked у Sentry vendor.

**Чому Honeycomb, не Datadog:**

Cost. Datadog $62/міс mandatory bottom; Honeycomb free до 20M events. Sergeant-volume на personal-tier ніколи не перевищить free-tier.

**Чому 10% sample на сервері, 5% на web:**

Sergeant traffic ~50k requests/тиждень (per Pino histograms). 10% = 5000 traces/тиждень = ~22000/місяць — under 0.2% of Honeycomb cap. На клієнті volume ×3 (initial load + interactions), 5% тримає total <1% cap. Залишаємо запас на error-rate-spikes (auto-promote sample на 100% при `error=true` через `instrumentation-fetch` parent-based sampler).

**Чому НЕ Storybook-stories trace, не nightly:**

OTel — runtime tracing, не build-time profiling. Storybook unrelated.

---

## 5. Consequences

### Positive

- Single click від error breadcrumb до full trace (web fetch → server route → DB query → Anthropic call).
- Better SLO debugging — `/api/chat` p95 latency розкладається по spans (RAG context build, Anthropic call, tool execution, response stream).
- Vendor-agnostic — swap Honeycomb за 2 env-vars.
- Mobile-ready foundation (instrumentation-fetch і OTLP працюють з RN).

### Negative

- Bundle size: `@opentelemetry/sdk-trace-web` + `instrumentation-fetch` ~50KB gzipped. Mitigation: lazy-load при `idle()` після першого paint, як Sentry.
- Implementation effort: ~5 робочих днів для server + web baseline.
- Free-tier risk: при traffic spike (e.g., AI-content goes viral) можемо вилетіти за 20M events. Mitigation: dynamic sample rate через env-var; alert у Datadog при наближенні до cap (через webhook Honeycomb → Discord).
- Wire через server-proxy для OTLP-export — додатковий route у Express. (Альтернатива: configure Honeycomb CORS, але self-hosted environments може не підтримувати.)

### Neutral

- Не зачіпає Pino-логи і Prometheus-метрики. Просто додає `traceId`/`spanId` як bindings.
- Не зачіпає Sentry error tracking.

---

## 6. Compliance

- **Server bootstrap:** `apps/server/src/obs/tracing.ts` має імпортуватися ПЕРЕД будь-яким `import "express"` у `apps/server/src/index.ts` (otel auto-instrumentation вимагає raw require). Перевірка: ESLint правило `sergeant-design/otel-bootstrap-first` (нове, додамо при implementation).
- **Sentry tracing вимкнений:** `apps/web/src/core/observability/sentry.ts` має умовно НЕ передавати `browserTracingIntegration`, якщо `VITE_OTEL_ENABLED=true`. Перевірка: unit test на `sentry.ts` initialization.
- **Sample rate validation:** Honeycomb dashboard alert якщо daily event count > 1M (близько до 20M місячного cap). Manual review щотижня.
- **Trace privacy:** Span-атрибути НЕ містять PII. Existing Pino redaction config (`apps/server/src/obs/logger.ts`, `redactPaths` + `redactKeyNames`) і URL-sanitizer (`apps/server/src/obs/sensitiveUrl.ts`) реюзаємо у custom `SpanProcessor`. Перевірка: integration test на trace export з `email=...` mock-input → assertion що span.attributes не містить email.

## 7. Implementation status

### 7.1 Shipped (2026-05-05)

Зміни відносно оригінального roadmap-у: vendor-agnostic, без web SDK, Sentry web не вимикаємо автоматично (див. ініціативу 0004).

| Step | Owner      | Status                                 | Result                                                                                                                                                                                            |
| ---- | ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | @Skords-01 | ❌ Skipped — vendor-decision дефернуто | Vendor backend обирається на ops-рівні через `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`; SaaS API key — через `OTEL_EXPORTER_OTLP_TRACES_HEADERS`.                                                      |
| 2    | @Skords-01 | ✅ Shipped                             | `apps/server/src/obs/tracing.ts` (NodeSDK, OTLP/HTTP), `apps/server/src/obs/sampler.ts` (route-aware), `apps/server/src/obs/spans.ts` (`aiSpan` / `dbSpan`).                                      |
| 3    | @Skords-01 | ⚠️ Пов-нав-піл: тільки traceparent     | `packages/api-client/src/httpClient.ts` генерує W3C `traceparent` без SDK. RUM-рівень web spans — окрема P1 ініціатива 0006-rum-spans-web (план).                                                 |
| 4    | @Skords-01 | ❌ Skipped — рішення змінено           | Sentry web tracing не конфліктує з server OTel; runbook рекомендує `SENTRY_TRACES_SAMPLE_RATE=0` як soft-disable після ввімкнення OTLP. ESLint rule не додано — import-ордер прикриває typecheck. |
| 5    | @Skords-01 | ✅ Shipped                             | `apps/server/src/http/traceContext.ts` бере `traceId` з OTel-active span (`getActiveTraceId`), з fallback-ом на header-парсер. Pino logs вже мають це binding.                                    |
| 6    | @Skords-01 | ✅ Shipped                             | `apps/server/src/obs/tracing.ts` HEADER_DENYLIST редактує authorization/cookie/x-api-key/webhook-secrets. `aiSpan` НЕ пише prompt text у attributes.                                              |

### 7.2 Чого НЕ робимо зараз

- **Web SDK у бандлі.** `@opentelemetry/sdk-trace-web` + `instrumentation-fetch` ~50KB gzip. Для Sergeant-volume web→server traceparent дає 95% вигоди (correlation across boundary) без SDK. RUM-рівень (web fetch / paint / interaction spans) — окрема P1 ініціатива.
- **Final-backend вибір.** Рано фіксувати Honeycomb без реального volume в prod-і. На сьогодні бажаються Grafana Cloud Tempo (вже є в ops, єдиний vendor) або Honeycomb (потужніша query-мова). Рішення — окремий PR з ops-experiment-ом після 1-го тижня live data.
- **Sentry web tracing OFF.** Sentry web tracing і server OTel НЕ конфліктують в prod-і (Sentry Performance API уживає standalone-trace-id, єдиний оверлап — sampled-rate spend; оператор регулює через env). Одна лінія у runbook-у замінює код-зміни.
- **ESLint rule `otel-bootstrap-first`.** Через ESM static-evaluation, `import "./obs/tracing.js"` розміщення першим у `index.ts` прикривається код-ревію + typecheck `tsconfig` первиреже broken import-ордер впинаючи лініїну логіку (Sentry init бьється раніше за OTel, якщо розвʼязано неправильно). Для safety-net буде додано ESLint rule як follow-up у 0006-rum-spans-web.

### 7.3 Roadmap-факт

Total: ~3 working days (замість оригінальних 5) — секономили 1.5 дня на web SDK (перенесено у 0006) + 0.5 дня на Sentry-OFF flow.

## 8. Links

- Audit row: [`docs/audits/2026-04-28-sergeant-comprehensive-audit.md`](../audits/2026-04-28-sergeant-comprehensive-audit.md) §P3-2.
- OTel JS docs: <https://opentelemetry.io/docs/languages/js/>.
- Honeycomb OTLP: <https://docs.honeycomb.io/getting-data-in/otel-collector/>.
- W3C Trace Context: <https://www.w3.org/TR/trace-context/>.
