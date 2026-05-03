# ADR-0035: Distributed tracing — web→server via OpenTelemetry

- **Status:** Proposed
- **Date:** 2026-05-03
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0015](./0015-observability-stack.md) — observability stack (Pino + Prometheus + Sentry); цей ADR розширює його traces-шаром.
  - [`docs/observability/frontend.md`](../observability/frontend.md) §7 «Sentry-події не з'єднані» — поточний gap.
  - [`apps/server/src/obs/requestContext.ts`](../../apps/server/src/obs/requestContext.ts) — ALS-based request context (вже є `requestId`, але без trace propagation).
  - [`docs/audits/2026-04-28-sergeant-comprehensive-audit.md`](../audits/2026-04-28-sergeant-comprehensive-audit.md) §P3-2 — audit row.

---

## 0. TL;DR

Запропонований план: ввести **OpenTelemetry distributed tracing** для зв'язку web → server (і пізніше mobile → server) через стандартний `traceparent` header. Backend — **Honeycomb (free tier 20M events/місяць)** для traces; existing Pino logs і Prometheus метрики залишаються незмінні. Sentry tracing на web вимикаємо (не можна одночасно мати два tracing-провайдери — конфліктують через Performance API). Status — **Proposed**, бо потребує (1) approval на третій SaaS-сервіс у стеку observability, (2) ~5 днів implementation, (3) free-tier validation для нашого volume.

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
- Bootstrap у `apps/web/src/core/observability/tracing.ts` (нове), lazy-loaded як Sentry, щоб не тягти OTel-bundle у hot path.
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
- **Trace privacy:** Span-атрибути НЕ містять PII. Existing Pino sanitizer (`apps/server/src/obs/sanitize.ts`) реюзаємо у custom `SpanProcessor`. Перевірка: integration test на trace export з `email=...` mock-input → assertion що span.attributes не містить email.

## 7. Implementation roadmap (post-approval)

| Step | Owner      | Effort | Done when                                                         |
| ---- | ---------- | ------ | ----------------------------------------------------------------- |
| 1    | @Skords-01 | 0.5 d  | Honeycomb account created, `HONEYCOMB_API_KEY` у Vault.           |
| 2    | impl       | 1.5 d  | Server bootstrap + auto-instrumentation; trace візуалізується.    |
| 3    | impl       | 1.5 d  | Web bootstrap + lazy load; full trace візуалізується від click.   |
| 4    | impl       | 0.5 d  | Sentry web tracing OFF; ESLint rule `otel-bootstrap-first` added. |
| 5    | impl       | 0.5 d  | Pino bindings: `traceId`/`spanId` у logs.                         |
| 6    | impl       | 0.5 d  | Privacy: PII redaction у span attrs (тести).                      |

Total: ~5 working days. Implementation tracked в окремому PR (не цьому ADR).

## 8. Links

- Audit row: [`docs/audits/2026-04-28-sergeant-comprehensive-audit.md`](../audits/2026-04-28-sergeant-comprehensive-audit.md) §P3-2.
- OTel JS docs: <https://opentelemetry.io/docs/languages/js/>.
- Honeycomb OTLP: <https://docs.honeycomb.io/getting-data-in/otel-collector/>.
- W3C Trace Context: <https://www.w3.org/TR/trace-context/>.
