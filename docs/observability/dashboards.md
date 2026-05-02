# Мінімальні Grafana-дашборди (Prometheus)

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

Це "starter pack" панелей, яких достатньо, щоб швидко зрозуміти: **що саме горить**
(HTTP / DB / Auth / Sync / AI / upstream), **де** і **чому**.

> Порада: для інцидентів завжди корелюй з логами Pino за `requestId`
> (див. `X-Request-Id` у відповідях API) та Sentry issue.

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

## AI / зовнішні upstream-сервіси

- **результати зовнішніх upstream**:
  - `sum by (upstream, outcome) (rate(external_http_requests_total[5m]))`
- **p95 зовнішнього upstream**:
  - `histogram_quantile(0.95, sum by (le, upstream, outcome) (rate(external_http_duration_ms_bucket[5m])))`
- **блокування AI-квоти**:
  - `sum by (reason) (rate(ai_quota_blocks_total[5m]))`
- **AI quota fail-open (критично для білінгу)**:
  - `sum by (reason) (rate(ai_quota_fail_open_total[5m]))`

## Rate limiting

- **заблоковано/пропущено**:
  - `sum by (key, outcome) (rate(rate_limit_hits_total[5m]))`

---

## Готові до імпорту Grafana-dashboard JSON-и

Готові до імпорту JSON-dashboard-и лежать у [`dashboards/`](./dashboards/). Деталі про datasource-variable-и й очікувані label-и див. у [`dashboards/README.md`](./dashboards/README.md).

| Файл                                                    | Скоуп                                                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`http-red.json`](./dashboards/http-red.json)           | HTTP RED (rate, errors, duration p50/p95/p99) з фільтром по module/path                             |
| [`db-use.json`](./dashboards/db-use.json)               | Postgres pool USE, тривалість запитів, slow-запити, DB-помилки                                      |
| [`slo-burn-rate.json`](./dashboards/slo-burn-rate.json) | Multi-window multi-burn-rate SLO-огляд (усі домени)                                                 |
| [`sync.json`](./dashboards/sync.json)                   | Результати sync по op/module/outcome, p95 тривалості, p95 payload, conflict ratio, SLO burn-rate    |
| [`auth.json`](./dashboards/auth.json)                   | Результати auth, p95 session-lookup, rate-limit-hit-и, sign-in success-rate                         |
| [`ai-cost.json`](./dashboards/ai-cost.json)             | AI token-rate по моделі, daily spend, cache-hit ratio, quota blocks/fail-open, результати й latency |
| [`hubchat.json`](./dashboards/hubchat.json)             | HubChat tool-invocation leaderboard, executed/proposed-співвідношення, unknown_tool, truncation-и   |
| [`frontend-cwv.json`](./dashboards/frontend-cwv.json)   | Core Web Vitals — LCP/INP/FCP/TTFB/CLS good/needs-improvement/poor-ratio + p75 (baseline-режим)     |

Імпорт через Grafana UI: **Dashboards → Import → Upload JSON**.
