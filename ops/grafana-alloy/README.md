# Grafana Alloy — Phase 2 metrics scraper

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Active

Лёгкий scrape-only агент, який ходить по `/metrics` n8n + apps/server і пушить
все у Grafana Cloud Prometheus. Без локального TSDB — це робота Grafana Cloud.

Контекст рішення — [`docs/architecture/hosting-evolution.md`](../../docs/architecture/hosting-evolution.md)
§Фаза 2 та [`docs/adr/0015-observability-stack.md`](../../docs/adr/0015-observability-stack.md)
§ADR-15.2 (exit criterion: scrape-інфра).

## Що скрейпиться

| Job               | Endpoint                            | Auth                   |
| ----------------- | ----------------------------------- | ---------------------- |
| `n8n`             | `${N8N_METRICS_TARGET}/metrics`     | none                   |
| `sergeant-server` | `${SERGEANT_SERVER_TARGET}/metrics` | bearer `METRICS_TOKEN` |

External label `project=sergeant` додається до кожної серії — щоб у Grafana
Cloud (де може бути кілька проектів) фільтр був прозорий.

## Локально (для перевірки конфіга)

```bash
# 1. Заповни Grafana Cloud creds у ops/.env.ops:
#    GRAFANA_CLOUD_PROMETHEUS_URL, GRAFANA_CLOUD_PROMETHEUS_USERNAME, GRAFANA_CLOUD_PROMETHEUS_API_KEY

# 2. Підніми стек з cloud-профілем (alloy додасться поряд з prometheus/grafana):
docker compose -f ops/docker-compose.ops.yml --env-file ops/.env.ops --profile cloud up -d grafana-alloy

# 3. Перевір UI агента (debug graph + targets):
open http://localhost:12345/graph
```

## Production (Railway)

1. Railway → New Service → Deploy from GitHub Repo
2. **Root Directory:** `ops/grafana-alloy`
3. **Build:** Dockerfile (auto-detected)
4. **Variables:**

   | Змінна                              | Значення                                                    |
   | ----------------------------------- | ----------------------------------------------------------- |
   | `GRAFANA_CLOUD_PROMETHEUS_URL`      | `https://prometheus-prod-XX-XXXX.grafana.net/api/prom/push` |
   | `GRAFANA_CLOUD_PROMETHEUS_USERNAME` | numeric instance ID (Grafana Cloud → My Account)            |
   | `GRAFANA_CLOUD_PROMETHEUS_API_KEY`  | API token, scope `metrics:write`                            |
   | `METRICS_TOKEN`                     | той самий, що у `apps/server` сервісу Railway               |
   | `N8N_METRICS_TARGET`                | `n8n.railway.internal:5678` (private network)               |
   | `SERGEANT_SERVER_TARGET`            | `<server>.railway.internal:3000`                            |
   | `SERGEANT_SERVER_SCHEME`            | `http` (private network — без TLS)                          |

   Railway автоматично резолвить `*.railway.internal` для сервісів у тому ж
   проекті — публічні URL не потрібні, метрики не залишають Railway VPC.

5. Деплой → перевір логи `Alloy started`. У Grafana Cloud → Explore →
   Prometheus datasource → запит `up{project="sergeant"}` має показати 2
   targets зі значенням `1`.

## Імпорт дашбордів у Grafana Cloud

Після того як `up{project="sergeant"} == 1` для обох targets — імпортуй
дашборди з `docs/observability/dashboards/` через **Dashboards → Import →
Upload JSON**. Datasource — той самий `grafanacloud-<instance>-prom`.

`slo-burn-rate.json` залежить від recording rules з
[`docs/observability/prometheus/recording_rules.yml`](../../docs/observability/prometheus/recording_rules.yml)
— завантаж їх у Grafana Cloud → Alerts & IRM → Alert rules → Recording rules
(або `mimirtool rules sync`).

## Алерти

Alert rules у [`docs/observability/prometheus/alert_rules.yml`](../../docs/observability/prometheus/alert_rules.yml)
вантажаться так само (`mimirtool rules sync`). Contact point — Telegram
через webhook (див. `ops/n8n-workflows/03-sentry-alert-routing.json` як
референс для формату повідомлень).

## Чому Alloy, а не повний Prometheus

- Прометеус потребує persistent volume під TSDB — Railway хоче окремих
  грошей за volume і CPU при розборі retention.
- Alloy не зберігає метрики локально, лише ретранслює — RAM ~50 МБ, CPU
  мінорний. Усі 30-day retention робить Grafana Cloud free tier.
- Якщо Grafana Cloud впаде — Alloy буфер ~2h (WAL on disk у контейнері),
  після чого drop-ить семпли. Це прийнятно для phase 2.

## Troubleshooting

- **`up == 0` для `sergeant-server`** — перевір `METRICS_TOKEN` збігається
  у Railway env vars обох сервісів (`apps/server` + `grafana-alloy`).
- **`401 Unauthorized` у логах Alloy** — `GRAFANA_CLOUD_PROMETHEUS_API_KEY`
  без scope `metrics:write` або зіпсувався при копіюванні.
- **`429 Too Many Requests`** — впираєшся у rate limit free tier (10K
  active series). Зменш `scrape_interval` до 60s або упрости labels.
