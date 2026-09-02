# Sergeant Operations Stack — Prometheus + Grafana

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-02.
> **Status:** Active

Локальний стек моніторингу для Sergeant: Prometheus скрейпить `/metrics` бекенду, Grafana провіжнить дашборди з репо, Grafana Alloy (профіль `cloud`) шле ті самі метрики у Grafana Cloud для production.

> **n8n виведено з експлуатації** ([ADR-0090](../docs/04-governance/adr/0090-n8n-decommissioned.md)). Workflow-и, manifest, reporting-матриця та валідатор прибрані з репо; крони, які вони виконували, живуть у серверних таймерах ([ADR-0089](../docs/04-governance/adr/0089-job-substrates-outbox-broker-timer.md)). Історичний стан шару — у [permalink-снапшоті](https://github.com/SkOrDs-02/sergeant/blob/ffdf694cb60dcfeebc2c1de14887c5a8a1d71e6b/ops/n8n-workflows/).

## Що всередині

```
ops/
├── docker-compose.ops.yml      # Prometheus + Grafana (+ Alloy під профілем `cloud`)
├── .env.ops.example            # Шаблон env-змінних
├── README.md                   # Цей файл
├── prometheus/
│   ├── prometheus.template.yml # scrape-конфіг (METRICS_TOKEN підставляється на старті)
│   └── rules/                  # alert rules (server.yml, gdpr.yml, voyage-cost.yml)
├── grafana/
│   ├── datasources/            # Prometheus datasource
│   └── dashboards/             # provisioning-конфіг дашбордів
├── grafana-alloy/              # Phase 2: scrape-only агент → Grafana Cloud
│   ├── config.alloy
│   ├── Dockerfile
│   └── README.md
└── posthog/                    # PostHog dashboards as portable manifests (PR-10+)
    ├── README.md               # Folder contract + import workflow
    └── dashboards/             # founder-pulse.json, hub-tab-perf.json
```

## Швидкий старт

### 1. Env-змінні

```bash
cp ops/.env.ops.example ops/.env.ops
# Заповни значення (див. коментарі у файлі)
```

Мінімум для старту:

| Змінна              | Звідки                                                 |
| ------------------- | ------------------------------------------------------ |
| `METRICS_TOKEN`     | той самий, що у `.env` сервера (bearer для `/metrics`) |
| `GF_ADMIN_PASSWORD` | `openssl rand -base64 24`                              |

### 2. Запуск (локально)

```bash
docker compose -f ops/docker-compose.ops.yml --env-file ops/.env.ops up -d
```

| Сервіс     | URL                   | Логін                            |
| ---------- | --------------------- | -------------------------------- |
| Prometheus | http://127.0.0.1:9090 | —                                |
| Grafana    | http://127.0.0.1:3001 | `admin` / `${GF_ADMIN_PASSWORD}` |

Обидва порти прив'язані до loopback — стек не виставляється назовні навіть на VPS.

### 3. Deploy (Coolify / будь-який Docker-хост)

Railway виведено з експлуатації ([ADR-0074](../docs/04-governance/adr/0074-hosting-hetzner-coolify.md)). Локальний `prometheus`/`grafana` — для дев-дебагу; production-метрики йдуть через Alloy у Grafana Cloud (див. § Phase 2 нижче).

## Моніторинг (Prometheus + Grafana)

Grafana автоматично підключає Prometheus як datasource та провіжнить
дашборди з `docs/03-operations/observability/dashboards/*.json` — `http-red`, `db-use`, `slo-burn-rate`, `sync`, `auth`, `ai-cost`, `hubchat`, `frontend-cwv`.

Усі дашборди потрапляють у папку **Sergeant Ops** у Grafana UI. Це сирі JSON-файли з `__inputs`-секцією; під
час провіженінгу Grafana 11 підставляє єдину Prometheus datasource у
`DS_PROMETHEUS`-змінну автоматично.

### Server-side дашборди

Покладаються на recording rules з
[`docs/03-operations/observability/prometheus/recording_rules.yml`](../docs/03-operations/observability/prometheus/recording_rules.yml)
(особливо `slo-burn-rate.json`). Локально вони ще не вантажаться у Prometheus
— потрібно або руками скопіювати правила у `ops/prometheus/rules/`, або
дочекатись Phase 2 (Grafana Cloud — див. нижче), де `mimirtool rules sync`
це робить безболісно.

### Alert rules (Prometheus)

Джерела — [`ops/prometheus/rules/`](./prometheus/rules/): `server.yml` (health бекенду), `gdpr.yml` (stuck-рядки cleanup-черги, ADR-0016), `voyage-cost.yml` (денний бюджет embeddings).

| Alert                         | Умова                                 | Severity |
| ----------------------------- | ------------------------------------- | -------- |
| `ServerDown`                  | сервер не відповідає 5 хв             | page     |
| `ServerHighMemory`            | сервер RSS >512 MB протягом 10 хв     | warning  |
| `GdprCleanupQueueStuckRows`   | є stuck-рядки у `gdpr_cleanup_queue`  | ticket   |
| `VoyageDailyBudgetSoftBreach` | денний бюджет Voyage — м'який поріг   | warning  |
| `VoyageDailyBudgetHardBreach` | денний бюджет Voyage — жорсткий поріг | page     |

### Prometheus targets

http://127.0.0.1:9090/targets

### Troubleshooting — метрики не збираються

1. Переконайся що `pnpm dev:server` запущений
2. Перевір збіг `METRICS_TOKEN` у `.env.ops` і `.env`
3. `curl -H "Authorization: Bearer <token>" http://localhost:3000/metrics`

### Phase 2 — Grafana Cloud + Alloy (production scrape)

Як тільки доходимо до публічного лаунчу
([`docs/02-engineering/architecture/hosting-evolution.md`](../docs/02-engineering/architecture/hosting-evolution.md)
§Фаза 2) — локальний `prometheus`/`grafana` лишається для дев-дебагу, а
production-метрики йдуть у Grafana Cloud free tier через лёгкого
[Grafana Alloy](https://grafana.com/docs/alloy/latest/) агента.

Конфіг агента, Dockerfile і повна інструкція деплою —
[`ops/grafana-alloy/README.md`](./grafana-alloy/README.md).

TL;DR:

```bash
# 1. Створи безкоштовний Grafana Cloud stack: https://grafana.com/auth/sign-up
# 2. Заповни у ops/.env.ops:
#    GRAFANA_CLOUD_PROMETHEUS_URL, GRAFANA_CLOUD_PROMETHEUS_USERNAME,
#    GRAFANA_CLOUD_PROMETHEUS_API_KEY (scope metrics:write)
# 3. Локальна перевірка конфіга:
docker compose -f ops/docker-compose.ops.yml --env-file ops/.env.ops --profile cloud up -d grafana-alloy
# 4. Production: задеплой ops/grafana-alloy/ як окремий Docker-сервіс у Coolify
```

Після того як `up{job="sergeant-server"} == 1` — імпортуй
дашборди з `docs/03-operations/observability/dashboards/` через Grafana Cloud UI та
завантаж recording + alert rules через `mimirtool rules sync`. Деталі — у
[`ops/grafana-alloy/README.md`](./grafana-alloy/README.md#імпорт-дашбордів-у-grafana-cloud).

## Telegram-алерти

Бот і chat ID для алертів — у Coolify env бекенду (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`); маршрутизація — [`docs/03-operations/observability/alert-bot-routing.md`](../docs/03-operations/observability/alert-bot-routing.md).

- Перевір `TELEGRAM_BOT_TOKEN` і `TELEGRAM_ALERT_CHAT_ID`
- Бот має бути адміном каналу
- Тест: `curl -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" -d chat_id=<ID> -d text="test"`

## Вартість

| Компонент                    | Вартість/міс |
| ---------------------------- | ------------ |
| Prometheus + Grafana (local) | $0           |
| Grafana Cloud free tier      | $0           |
| **Total**                    | **$0**       |
