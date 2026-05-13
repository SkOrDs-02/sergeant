# Observability env-vars

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-11.
> **Status:** Active

Цей файл — observability-індекс по env-vars, які впливають на дашборди й алерти у `docs/observability/dashboards/`. Канонічні описи (defaults, валідація, sentinel-значення) живуть у [`docs/integrations/env-vars.md`](../integrations/env-vars.md) — тут лише посилання + який саме panel/alert ламається без них.

## Сумарна таблиця

| Env-var                              | Default           | Дашборд / алерт, що залежить                                                                                                                                         | Канонічний опис                                                                                                                                                                                                                          |
| ------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_MONTHLY_BUDGET_USD`       | `0`               | [`ai-cost.json`](./dashboards/ai-cost.json) — panel «Run-rate vs budget envelopes»; [`cost-monitoring.json`](./dashboards/cost-monitoring.json)                      | [`integrations/env-vars.md § AI budget envelopes`](../integrations/env-vars.md#ai-budget-envelopes). Без нього `infra_monthly_cost_usd{provider="anthropic"}` НЕ публікується → bargauge не має target-line, run-rate % не обчислюється. |
| `VOYAGE_MONTHLY_BUDGET_USD`          | `0`               | [`ai-cost.json`](./dashboards/ai-cost.json) — те саме                                                                                                                | [`integrations/env-vars.md § AI budget envelopes`](../integrations/env-vars.md#ai-budget-envelopes). Аналогічно — без нього Voyage run-rate-bar без target-у.                                                                            |
| `VOYAGE_DAILY_BUDGET_USD`            | `0`               | Prometheus rule [`ops/prometheus/rules/voyage-cost.yml`](../../ops/prometheus/rules/voyage-cost.yml) — `VoyageDailyBudgetSoftBreach` / `VoyageDailyBudgetHardBreach` | [`integrations/env-vars.md § AI budget envelopes`](../integrations/env-vars.md#ai-budget-envelopes). Soft daily-burn threshold для Voyage (`voyage_daily_budget_usd` gauge). `0` → rule disabled (guard `> 0`).                          |
| `ANTHROPIC_BUDGET_SOFT_USD`          | `3`               | PR-14 background-tick → Sentry warn → n8n WF-22                                                                                                                      | [`integrations/env-vars.md § AI budget envelopes`](../integrations/env-vars.md#ai-budget-envelopes). Soft USD threshold per day (Anthropic). `0` → kill-switch.                                                                          |
| `ANTHROPIC_BUDGET_HARD_USD`          | `5`               | PR-14 — Sentry error + `isAnthropicBudgetHardExceeded()` throttle-flag                                                                                               | [`integrations/env-vars.md § AI budget envelopes`](../integrations/env-vars.md#ai-budget-envelopes). Hard USD threshold per day (Anthropic).                                                                                             |
| `ANTHROPIC_BUDGET_ALERT_ENABLED`     | `true`            | PR-14 budget-loop scheduler                                                                                                                                          | [`integrations/env-vars.md § AI budget envelopes`](../integrations/env-vars.md#ai-budget-envelopes). Kill-switch — `false` зупиняє scheduler (counter все одно тікає).                                                                   |
| `ANTHROPIC_BUDGET_CHECK_INTERVAL_MS` | `300000`          | PR-14 — період background-tick                                                                                                                                       | [`integrations/env-vars.md § AI budget envelopes`](../integrations/env-vars.md#ai-budget-envelopes). 5 хв за замовчуванням.                                                                                                              |
| `RAILWAY_MONTHLY_COST_USD` / `_PLAN` | `0` / `hobby`     | [`cost-monitoring.json`](./dashboards/cost-monitoring.json) — «Fixed monthly subscriptions», «Cost by provider»                                                      | [`integrations/env-vars.md § Cost monitoring`](../integrations/env-vars.md#cost-monitoring-pr-33). PR-33 fixed-monthly.                                                                                                                  |
| `VERCEL_MONTHLY_COST_USD` / `_PLAN`  | `0` / `hobby`     | Те саме                                                                                                                                                              | [`integrations/env-vars.md § Cost monitoring`](../integrations/env-vars.md#cost-monitoring-pr-33).                                                                                                                                       |
| `POSTHOG_MONTHLY_COST_USD` / `_PLAN` | `0` / `free`      | Те саме                                                                                                                                                              | [`integrations/env-vars.md § Cost monitoring`](../integrations/env-vars.md#cost-monitoring-pr-33).                                                                                                                                       |
| `SENTRY_MONTHLY_COST_USD` / `_PLAN`  | `0` / `developer` | Те саме                                                                                                                                                              | [`integrations/env-vars.md § Cost monitoring`](../integrations/env-vars.md#cost-monitoring-pr-33).                                                                                                                                       |
| `ANTHROPIC_API_KEY`                  | — (req)           | `ai_cost_estimate_usd_total{provider="anthropic"}` — основа всіх Anthropic-панелей                                                                                   | [`integrations/env-vars.md § Anthropic`](../integrations/env-vars.md#ai). Без ключа `recordAnthropicUsage` ніколи не викликається → серії немає.                                                                                         |
| `VOYAGE_API_KEY`                     | opt.              | `ai_cost_estimate_usd_total{provider="voyage"}` — Voyage-панелі                                                                                                      | [`integrations/env-vars.md § AI memory`](../integrations/env-vars.md#ai). Опційне; обовʼязкове коли `AI_MEMORY_ENABLED=true`.                                                                                                            |
| `AI_MEMORY_ENABLED`                  | `false`           | Аналогічно — gating для Voyage `recordVoyageUsage`                                                                                                                   | [`integrations/env-vars.md § AI memory`](../integrations/env-vars.md#ai). `false` → embedding-flow вимкнено, Voyage-метрики плоскі.                                                                                                      |
| `METRICS_TOKEN`                      | opt.              | `/metrics` endpoint (Prometheus scrape target)                                                                                                                       | [`integrations/env-vars.md § METRICS_TOKEN`](../integrations/env-vars.md#metrics_token-optional). Якщо встановлено — у Prometheus-конфігу `bearer_token` має співпадати, інакше scrape повертає 401 і ВСІ серії пропадають.              |

## Як перевірити локально

Швидкий smoke-тест, що Anthropic / Voyage counter-и реально пишуть на `/metrics`:

```bash
# 1. Стартуй сервер з мінімальним cost-tracking конфігом:
ANTHROPIC_API_KEY=test-key \
ANTHROPIC_MONTHLY_BUDGET_USD=200 \
VOYAGE_API_KEY=test-key \
VOYAGE_MONTHLY_BUDGET_USD=20 \
AI_MEMORY_ENABLED=true \
pnpm dev:server

# 2. У іншому терміналі виконай якийсь Anthropic-виклик, потім:
curl -s http://localhost:3000/metrics | grep -E '^(ai_cost_estimate_usd_total|infra_monthly_cost_usd)\b'

# Очікувано:
# infra_monthly_cost_usd{provider="anthropic",plan="usage"} 200
# infra_monthly_cost_usd{provider="voyage",plan="usage"} 20
# ai_cost_estimate_usd_total{provider="anthropic",model="claude-sonnet-4-...",endpoint="chat"} 0.012345
```

Якщо `infra_monthly_cost_usd` НЕ зʼявляється — значить `ANTHROPIC_MONTHLY_BUDGET_USD` / `VOYAGE_MONTHLY_BUDGET_USD` = `0` (default). Це валідний стан, але Grafana панель «Run-rate vs budget envelopes» залишиться порожньою у правій колонці.

## Деплоймент

На Railway env-vars задаються у service-dashboard-і; список обовʼязкових / опційних дивись у [`docs/integrations/railway-vercel.md`](../integrations/railway-vercel.md). Без `*_MONTHLY_BUDGET_USD` ні Anthropic, ні Voyage cost-логування НЕ ламається — лише пропадає target-line на bargauge-у. Sentry alerting (PR-14) деградує до no-op, якщо `ANTHROPIC_BUDGET_ALERT_ENABLED=false`.

## See also

- [`metrics.md` § Cost monitoring](./metrics.md#16-cost-monitoring-pr-33--pr-38) — повний перелік PromQL-запитів.
- [`runbook.md`](./runbook.md) — incident response на cost-alert-и.
- [`integrations/env-vars.md`](../integrations/env-vars.md) — канонічний reference усіх env-vars.
