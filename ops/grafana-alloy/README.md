# Grafana Alloy — Phase 2 metrics scraper

> **Last touched:** 2026-07-19 by @claude. **Next review:** 2026-10-17.
> **Status:** Active

Лёгкий scrape-only агент, який ходить по `/metrics` n8n + apps/server і пушить
все у Grafana Cloud Prometheus. Без локального TSDB — це робота Grafana Cloud.

Контекст рішення — [`docs/02-engineering/architecture/hosting-evolution.md`](../../docs/02-engineering/architecture/hosting-evolution.md)
§Фаза 2 та [`docs/04-governance/adr/0015-observability-stack.md`](../../docs/04-governance/adr/0015-observability-stack.md)
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
дашборди з `docs/03-operations/observability/dashboards/` через **Dashboards → Import →
Upload JSON**. Datasource — той самий `grafanacloud-<instance>-prom`.

`slo-burn-rate.json` залежить від recording rules з
[`docs/03-operations/observability/prometheus/recording_rules.yml`](../../docs/03-operations/observability/prometheus/recording_rules.yml)
— завантаж їх у Grafana Cloud → Alerts & IRM → Alert rules → Recording rules
(або `mimirtool rules sync`).

## Алерти

Alert rules у [`docs/03-operations/observability/prometheus/alert_rules.yml`](../../docs/03-operations/observability/prometheus/alert_rules.yml)
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

## Міграція: перенести у проєкт `Sergeant` (план)

> **Чому.** Зараз сервіс живе у Railway-проєкті `SERGEANT_N8N`, тому скрейпить
> `apps/server` через **публічний** домен (`SERGEANT_SERVER_TARGET=sergeant-production.up.railway.app:443`,
> https + `METRICS_TOKEN`). Railway private network (`*.railway.internal`)
> працює **лише в межах одного проєкту**, тож internal-scrape API звідси
> неможливий. Перенесення Alloy у проєкт `Sergeant` дозволяє скрейпити API
> приватно (`<server>.railway.internal:3000`, http, без публічного egress) —
> Tier-1 метрики (15s, найбільше серій) не покидають VPC. Платою стає
> публічний scrape n8n (рідший, 30s, менш критичний — лишається у `SERGEANT_N8N`).

**Передумови:** доступ до Railway dashboard обох проєктів; під рукою значення
`GRAFANA_CLOUD_PROMETHEUS_{URL,USERNAME,API_KEY}` + `METRICS_TOKEN` (ті самі, що
вже на поточному сервісі).

1. **Новий сервіс у проєкті `Sergeant`.** Railway → проєкт `Sergeant` → New
   Service → Deploy from GitHub Repo (`SkOrDs-02/sergeant`), **Root Directory:**
   `ops/grafana-alloy`, Build: Dockerfile (auto). Назви `grafana-alloy`.
2. **Env нового сервісу:**
   | Змінна                              | Значення                                                                                                                                                                                          |
   | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `GRAFANA_CLOUD_PROMETHEUS_URL`      | (як на старому)                                                                                                                                                                                   |
   | `GRAFANA_CLOUD_PROMETHEUS_USERNAME` | (як на старому)                                                                                                                                                                                   |
   | `GRAFANA_CLOUD_PROMETHEUS_API_KEY`  | (як на старому)                                                                                                                                                                                   |
   | `METRICS_TOKEN`                     | той самий, що в сервісі `Sergeant` (можна Reference-змінною)                                                                                                                                      |
   | `SERGEANT_SERVER_TARGET`            | **`<server>.railway.internal:3000`** (private — резолвиться у тому ж проєкті)                                                                                                                     |
   | `SERGEANT_SERVER_SCHEME`            | **`http`** (private network, без TLS)                                                                                                                                                             |
   | `N8N_METRICS_TARGET`                | `n8n-production.up.railway.app:443` (тепер cross-project → **публічний** домен n8n) + `N8N_METRICS_SCHEME=https`, якщо config це підтримує; інакше тимчасово лишити n8n-scrape на старому сервісі |
3. **Parallel run.** Не вимикати старий сервіс одразу. Обидва remote_write-ять
   у той самий Grafana Cloud з `external_labels.project="sergeant"` → дублікати
   серій короткочасно (Mimir дедуплікує по labels+timestamp; сплеск active
   series у межах free-tier 10K прийнятний на кілька хвилин).
4. **Verify cutover.** У Grafana Cloud Explore: `up{job="sergeant-server"}` має
   бути `1` з нового сервісу (перевір `instance`-лейбл — internal host). Лог
   нового Alloy: `Alloy started` + 2 (або 1) healthy targets.
5. **Teardown.** Коли новий стабільний — у старому сервісі (`SERGEANT_N8N`)
   або прибрати `prometheus.scrape "sergeant_server"` (лишити лише n8n-scrape
   через internal), або вимкнути сервіс цілком, якщо n8n-scrape перенесено.
6. **Rollback.** Якщо `up==0` з нового — лишити старий працювати (він не
   чіпався), видалити новий сервіс, розслідувати `METRICS_TOKEN`/internal-DNS.

> **Тонкість config.alloy.** Поточний [`config.alloy`](./config.alloy) хардкодить
> n8n-target через `N8N_METRICS_TARGET` без окремого scheme (n8n у тому ж
> проєкті був http-internal). Для cross-project n8n-scrape по HTTPS треба додати
> `scheme = sys.env("N8N_METRICS_SCHEME")` у блок `prometheus.scrape "n8n"`
> (дзеркально до `sergeant_server`). Якщо не хочеться ускладнювати — лишити
> n8n-scrape на сервісі у `SERGEANT_N8N`, а новий Alloy у `Sergeant` робить
> лише API-scrape.
