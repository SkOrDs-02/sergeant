# Мінімальні Grafana-дашборди (Prometheus)

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-11.
> **Status:** Active

Це "starter pack" панелей, яких достатньо, щоб швидко зрозуміти: **що саме горить**
(HTTP / DB / Auth / Sync / AI / upstream), **де** і **чому**.

> Порада: для інцидентів завжди корелюй з логами Pino за `requestId`
> (див. `X-Request-Id` у відповідях API) та Sentry issue.

> **PostHog продукт-дашборди** (growth-funnel, FTUX, активація) — окремий шар і живуть у власних runbook-ах:
>
> - [`posthog-founder-pulse.md`](./posthog-founder-pulse.md) — Founder Pulse: DAU/WAU/MAU, WF-60 funnel (signup → onboarding → first_action → subscription), per-module funnel, D1/D7/D30 retention, activation rate, new-MRR, funnel-ZEROES canary. Portable manifest у [`ops/posthog/dashboards/founder-pulse.json`](../../ops/posthog/dashboards/founder-pulse.json).
> - [`posthog-ftux-dashboards.md`](./posthog-ftux-dashboards.md) — FTUX overview: activation funnel, TTV histogram, vibe→first-entry matrix, D1/D7 retention by signup-cohort, celebration drop-off.

## HTTP (RED)

- **RPS по route**:
  - `sum by (path) (rate(http_requests_total[5m]))`
- **5xx rate по route**:
  - `sum by (path) (rate(http_requests_total{status=~"5.."}[5m]))`
- **p95 latency по route**:
  - `histogram_quantile(0.95, sum by (le, path) (rate(http_request_duration_ms_bucket[5m])))`
- **in-flight (запити в обробці)**:
  - `sum(http_in_flight)`

## Postgres pool / slow-запити

- **очікування пулу (контеншн)**:
  - `max(db_pool_waiting)`
- **p95 тривалості запиту по op**:
  - `histogram_quantile(0.95, sum by (le, op) (rate(db_query_duration_ms_bucket[5m])))`
- **лічильник slow-запитів**:
  - `sum by (op) (rate(db_slow_queries_total[5m]))`

## Auth

- **результати автентифікації**:
  - `sum by (op, outcome) (rate(auth_attempts_total[5m]))`
- **p95 session-lookup**:
  - `histogram_quantile(0.95, sum by (le, outcome) (rate(auth_session_lookup_duration_ms_bucket[5m])))`

## Sync

- **результати синхронізації**:
  - `sum by (op, module, outcome) (rate(sync_operations_total[5m]))`
- **p95 тривалості sync**:
  - `histogram_quantile(0.95, sum by (le, op, module) (rate(sync_duration_ms_bucket[5m])))`
- **p95 розміру payload**:
  - `histogram_quantile(0.95, sum by (le, op, module) (rate(sync_payload_bytes_bucket[5m])))`
- **v2 op-log per-op outcomes (PR #048)**:
  - `sum by (table, status) (rate(sync_op_log_apply_total[5m]))`
- **v2 op-log reject-reason fan-out (PR #048)**:
  - `topk(10, sum by (table, reason) (rate(sync_op_log_apply_total{status="rejected"}[5m])))`
- **v2 pull staleness p95 (PR #048)**:
  - `histogram_quantile(0.95, sum by (le) (rate(sync_op_log_pull_lag_ms_bucket[5m])))`
- **v2 pull queue depth p95 (PR #048)**:
  - `histogram_quantile(0.95, sum by (le) (rate(sync_op_log_pull_queue_depth_bucket[5m])))`

## AI / зовнішні upstream-сервіси

- **результати зовнішніх upstream**:
  - `sum by (upstream, outcome) (rate(external_http_requests_total[5m]))`
- **p95 зовнішнього upstream**:
  - `histogram_quantile(0.95, sum by (le, upstream, outcome) (rate(external_http_duration_ms_bucket[5m])))`
- **блокування AI-квоти**:
  - `sum by (reason) (rate(ai_quota_blocks_total[5m]))`
- **AI quota fail-open (критично для білінгу)**:
  - `sum by (reason) (rate(ai_quota_fail_open_total[5m]))`

## Cost monitoring (PR-33)

- **30-day AI cost run-rate per provider** (Anthropic + Voyage):
  - `sum by (provider) (increase(ai_cost_estimate_usd_total[30d]))`
- **Daily AI burn per provider × model**:
  - `sum by (provider, model) (rate(ai_cost_estimate_usd_total[1d])) * 86400`
- **Voyage embed run-rate per model** (USD/day):
  - `sum by (model) (rate(ai_cost_estimate_usd_total{provider="voyage"}[1d])) * 86400`
- **Fixed monthly subscription cost** (Railway/Vercel/PostHog/Sentry):
  - `sum by (provider) (infra_monthly_cost_usd{provider=~"railway|vercel|posthog|sentry"})`
- **AI budget envelope** (Anthropic/Voyage targets):
  - `sum by (provider) (infra_monthly_cost_usd{provider=~"anthropic|voyage"})`
- **Combined 30-day run-rate** (AI + fixed):
  - `sum(increase(ai_cost_estimate_usd_total[30d])) + sum(infra_monthly_cost_usd{plan!="budget"})`
- **Run-rate vs budget ratio per AI provider**:
  - `sum by (provider) (increase(ai_cost_estimate_usd_total[30d])) / on(provider) sum by (provider) (infra_monthly_cost_usd{provider=~"anthropic|voyage"})`

## Rate limiting

- **заблоковано/пропущено**:
  - `sum by (key, outcome) (rate(rate_limit_hits_total[5m]))`

---

## Готові до імпорту Grafana-dashboard JSON-и

Готові до імпорту JSON-dashboard-и лежать у [`dashboards/`](./dashboards/). Деталі про datasource-variable-и й очікувані label-и див. у [`dashboards/README.md`](./dashboards/README.md).

| Файл                                                              | Скоуп                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`http-red.json`](./dashboards/http-red.json)                     | HTTP RED (rate, errors, duration p50/p95/p99) з фільтром по module/path                                                                                                                                            |
| [`db-use.json`](./dashboards/db-use.json)                         | Postgres pool USE, тривалість запитів, slow-запити, DB-помилки                                                                                                                                                     |
| [`slo-burn-rate.json`](./dashboards/slo-burn-rate.json)           | Multi-window multi-burn-rate SLO-огляд (усі домени)                                                                                                                                                                |
| [`sync.json`](./dashboards/sync.json)                             | Результати sync по op/module/outcome, p95 тривалості, p95 payload, conflict ratio, SLO burn-rate                                                                                                                   |
| [`auth.json`](./dashboards/auth.json)                             | Результати auth, p95 session-lookup, rate-limit-hit-и, sign-in success-rate                                                                                                                                        |
| [`ai-cost.json`](./dashboards/ai-cost.json)                       | PR-13 — focused AI-cost (Anthropic + Voyage): 30d-стати, hourly burn, per-model daily breakdown, top-10 endpoints, run-rate vs `*_MONTHLY_BUDGET_USD`, projected EOM spend, cache-hit ratio, quota fail-open guard |
| [`hubchat.json`](./dashboards/hubchat.json)                       | HubChat tool-invocation leaderboard, executed/proposed-співвідношення, unknown_tool, truncation-и                                                                                                                  |
| [`frontend-cwv.json`](./dashboards/frontend-cwv.json)             | Core Web Vitals — LCP/INP/FCP/TTFB/CLS good/needs-improvement/poor-ratio + p75 (baseline-режим)                                                                                                                    |
| [`n8n-webhook-events.json`](./dashboards/n8n-webhook-events.json) | n8n webhook-events replay (PR-28/PR-29): replay success-rate, attempts-over-time per workflow×outcome, top-10 workflows, p50/p95/p99 latency, latency-heatmap до 10s timeout                                       |

Імпорт через Grafana UI: **Dashboards → Import → Upload JSON**.

## n8n webhook-events replay (PR-28/PR-29)

`n8n_webhook_events` table (PR-28 #2608) фіксує всі вхідні webhook-events; replay CLI/API (PR-29 #2665) re-POST-ить їх до n8n. Сервер інструментує replay-цикл двома Prometheus-серіями:

- **`n8n_webhook_replay_attempts_total{workflow_id, outcome}`** — counter. `outcome ∈ {ok, http_error, unknown_workflow, timeout, error}`. Cardinality bound: 4 workflow-и × 5 outcomes = 20 series worst-case.
- **`n8n_webhook_replay_duration_ms_bucket{workflow_id, outcome, le}`** — histogram (buckets `[25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]` ms). 10s = `DEFAULT_TIMEOUT_MS` у [`replayWebhookEvent.ts`](../../apps/server/src/modules/webhooks/replayWebhookEvent.ts) — buckets щільніше у нижчій частині, бо здорові replay-и < 500ms.

Key PromQL queries (фіксовані у [`n8n-webhook-events.json`](./dashboards/n8n-webhook-events.json)):

- **Success rate (24h)**:
  - `sum(increase(n8n_webhook_replay_attempts_total{outcome="ok"}[24h])) / clamp_min(sum(increase(n8n_webhook_replay_attempts_total[24h])), 1)`
- **Replay attempts per minute (per workflow × outcome)**:
  - `sum by (workflow_id, outcome) (rate(n8n_webhook_replay_attempts_total[5m])) * 60`
- **Top workflows by replay count (24h)**:
  - `topk(10, sum by (workflow_id) (increase(n8n_webhook_replay_attempts_total[24h])))`
- **p95 latency per workflow**:
  - `histogram_quantile(0.95, sum by (le, workflow_id) (rate(n8n_webhook_replay_duration_ms_bucket[5m])))`
- **Failures by outcome (24h)**:
  - `sum by (outcome) (increase(n8n_webhook_replay_attempts_total{outcome!="ok"}[24h]))`
