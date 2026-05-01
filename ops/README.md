# Sergeant Operations Stack — n8n

Self-hosted n8n для автоматизації ops-задач Sergeant.
Повний контекст — [docs/launch/05-operations-and-automation.md](../docs/launch/05-operations-and-automation.md).

## Що всередині

```
ops/
├── docker-compose.ops.yml      # n8n + Postgres (compose stack)
├── .env.ops.example            # Шаблон env-змінних
├── README.md                   # Цей файл
└── n8n-workflows/
    │  — Revenue / Billing —
    ├── 01-billing-pipeline.json          # Stripe → DB → Telegram
    ├── 02-failed-payment-recovery.json   # Failed payment → email + downgrade
    │  — Ops / Alerting —
    ├── 03-sentry-alert-routing.json      # Sentry → Telegram (fatal / warning)
    ├── 04-daily-backup-verification.json # Cron 03:00 → Railway → sanity SQL
    ├── 05-renovate-pr-auto-handler.json  # Renovate PR → auto-approve patch / notify
    │  — Finance —
    ├── 06-mono-webhook-enrichment.json   # Mono tx → AI categorize → budget alert
    │  — Product / User notifications —
    ├── 07-morning-briefing-push.json     # Cron 07:30 Kyiv → push all subscribers
    ├── 08-weekly-financial-digest.json   # Cron Sun 20:00 → SQL + Claude Haiku → Telegram
    ├── 09-habit-streak-alert.json        # Cron 21:00 Kyiv → push habit reminder
    ├── 10-debt-receivable-reminder.json  # Cron 10:00 → debts due in 3 days → push + Telegram
    │  — Developer / Ops —
    ├── 15-railway-deployment-notify.json # Railway webhook → Telegram #deploys
    ├── 16-posthog-daily-metrics.json     # Cron 09:00 → PostHog API → Telegram #metrics
    ├── 17-github-pr-stale-alert.json     # Cron 10:00 Mon–Fri → PRs >48h → Telegram
    ├── 18-nightly-security-audit.json    # Cron 04:00 UTC → GitHub audit run → Telegram
    └── 19-db-health-report.json          # Cron Mon 07:00 → DB size + slow queries → Telegram
```

## Швидкий старт

### 1. Env-змінні

```bash
cp ops/.env.ops.example ops/.env.ops
# Заповни значення (див. коментарі у файлі)
```

Мінімум для старту:

| Змінна                   | Звідки                                                  |
| ------------------------ | ------------------------------------------------------- |
| `N8N_PASSWORD`           | `openssl rand -base64 24`                               |
| `N8N_ENCRYPTION_KEY`     | `openssl rand -hex 32`                                  |
| `N8N_DB_PASSWORD`        | `openssl rand -base64 24`                               |
| `TELEGRAM_BOT_TOKEN`     | [@BotFather](https://t.me/BotFather) → `/newbot`        |
| `TELEGRAM_ALERT_CHAT_ID` | `curl "https://api.telegram.org/bot<TOKEN>/getUpdates"` |

### 2. Запуск (локально)

```bash
docker compose -f ops/docker-compose.ops.yml --env-file ops/.env.ops up -d
```

n8n UI: [http://localhost:5678](http://localhost:5678)

### 3. Імпорт workflows

1. Відкрий n8n UI → **Workflows** → **Import from File**
2. Імпортуй кожен `.json` з `ops/n8n-workflows/`
3. Відкрий кожен workflow → налаштуй **Credentials** (Postgres, Telegram, Stripe, etc.)
4. Активуй workflow (toggle → **Active**)

### 4. Deploy на Railway

```bash
# Варіант A: Railway CLI
railway login
railway init
railway up --detach

# Варіант B: Railway UI
# railway.app → New Project → Docker Compose → upload ops/docker-compose.ops.yml
```

Після деплою:

- Встанови custom domain (Cloudflare DNS → CNAME)
- Оновити `WEBHOOK_URL` та `N8N_HOST` у env vars
- Переконайся що persistent volume підключено до `/home/node/.n8n`

## Workflow-и — деталі

### 01. Billing-пайплайн

**Тригер:** Stripe webhook `customer.subscription.created`
**Дія:** Update user plan → Pro в БД → Telegram повідомлення в `#revenue`

### 02. Відновлення після невдалого платежу

**Тригер:** Stripe webhook `invoice.payment_failed`
**Дія:** Telegram alert → Email "оновіть картку" → Retry wait → Downgrade після 4 спроб

### 03. Маршрутизація Sentry-алертів

**Тригер:** Sentry webhook (new issue / spike)
**Дія:** Filter severity ≥ warning → Telegram `#incidents` (fatal отримує окремий формат)

### 04. Щоденна перевірка бекапів

**Тригер:** Cron 03:00 UTC
**Дія:** Railway API → restore на staging → sanity SQL → Telegram OK / CRITICAL

### 05. Auto-handler для Renovate-PR

**Тригер:** GitHub webhook `pull_request.opened` (author = renovate[bot])
**Дія:** Patch → auto-approve; minor/major → Telegram review needed

### 06. Mono-webhook enrichment

**Тригер:** Mono webhook (нова транзакція)
**Дія:** Save → AI categorize (Claude) → Update DB → Budget threshold check → Telegram alert

### 07. Ранковий push-брифінг

**Тригер:** Cron 07:30 Kyiv (щодня)
**Дія:** Postgres → список юзерів з push-підписками → POST `/api/push/send` для кожного → "Доброго ранку! Відкрий Sergeant"

### 08. Тижневий фін-дайджест

**Тригер:** Cron неділя 20:00 Kyiv
**Дія:** Postgres → витрати за 7 днів по категоріях → Claude Haiku → Telegram дайджест

### 09. Алерт про ризик втрати стріку

**Тригер:** Cron 21:00 Kyiv (щодня)
**Дія:** Postgres → юзери з push-підписками → push "Не забудь звички!"

### 10. Нагадування про борги

**Тригер:** Cron 10:00 Kyiv (щодня)
**Дія:** Postgres → борги/дебіторка з `dueDate` ≤ +3 дні → push для кожного + Telegram summary

### 15. Railway-деплой — нотифікація

**Тригер:** Railway webhook (`deployment.success` / `deployment.failed`)
**Дія:** Парсинг payload → Telegram `#deploys` з гілкою, хешем, статусом

### 16. Щоденні PostHog-метрики

**Тригер:** Cron 09:00 Kyiv (щодня)
**Дія:** PostHog API → DAU + pageviews за вчора → Telegram `#metrics`

### 17. Алерт про застоялі GitHub-PR

**Тригер:** Cron 10:00 Kyiv (Пн–Пт)
**Дія:** GitHub API → open PRs → фільтр >48h без активності → Telegram якщо є

### 18. Підсумок нічного security-аудиту

**Тригер:** Cron 04:00 UTC (після `nightly-audit.yml` о 03:00)
**Дія:** GitHub API → останній запуск `nightly-audit.yml` → Telegram `#incidents` якщо `failure`

### 19. Репорт про здоров’я БД

**Тригер:** Cron понеділок 07:00 Kyiv
**Дія:** Postgres → розмір DB, топ-5 таблиць, повільні запити (`pg_stat_statements`) → Telegram `#ops`

## Credential-и у n8n

Після імпорту workflows — налаштуй credentials через n8n UI:

| Credential        | Тип                    | Потрібно для          |
| ----------------- | ---------------------- | --------------------- |
| Sergeant Postgres | PostgreSQL             | 01, 02, 04, 06–10, 19 |
| Sergeant Ops Bot  | Telegram Bot API       | 01–10, 15–19          |
| Stripe            | Webhook signing secret | 01, 02                |
| Resend            | API Key                | 02                    |
| Anthropic         | API Key                | 06, 08                |
| GitHub            | Token / Webhook secret | 05, 17, 18            |
| Railway           | API Token              | 04                    |

### Нові env-змінні для workflow-ів 07–19

Додай у n8n → Settings → Environment Variables:

| Змінна                     | Використовується в | Де взяти                                                              |
| -------------------------- | ------------------ | --------------------------------------------------------------------- |
| `API_SECRET`               | 07, 09, 10         | `.env` сервера (той самий `API_SECRET`)                               |
| `PUBLIC_API_BASE_URL`      | 07, 09, 10         | `https://your-api.railway.app`                                        |
| `POSTHOG_PERSONAL_API_KEY` | 16                 | PostHog → Settings → Personal API Keys                                |
| `POSTHOG_PROJECT_ID`       | 16                 | PostHog → Settings → Project → ID у URL                               |
| `GITHUB_PAT`               | 17, 18             | GitHub → Settings → Developer settings → PAT (classic), scope: `repo` |

### Railway-webhook (для workflow 15)

1. n8n UI → Workflow 15 → скопіюй webhook URL (вигляд: `https://n8n.your-domain.com/webhook/railway-deploy`)
2. Railway → твій проект → Settings → Webhooks → Add webhook → вставити URL

## Розв’язання проблем

### n8n не стартує

```bash
docker compose -f ops/docker-compose.ops.yml logs n8n
```

Частіше за все — неправильний `N8N_DB_PASSWORD` або Postgres ще не ready.

### Webhook не працює

- Перевір `WEBHOOK_URL` — має бути публічний URL (не localhost у prod)
- Stripe/GitHub/Sentry webhook endpoint: `{WEBHOOK_URL}/webhook/{path}`

### Telegram не відправляє

- Перевір `TELEGRAM_BOT_TOKEN` і `TELEGRAM_ALERT_CHAT_ID`
- Бот має бути адміном каналу
- Тест: `curl -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" -d chat_id=<ID> -d text="test"`

## Моніторинг (Prometheus + Grafana)

Prometheus і Grafana включені в той самий compose-файл.

| Сервіс     | URL                   | Логін                                               |
| ---------- | --------------------- | --------------------------------------------------- |
| Prometheus | http://localhost:9090 | —                                                   |
| Grafana    | http://localhost:3001 | `admin` / `${GF_ADMIN_PASSWORD}` (default: `admin`) |

Grafana автоматично підключає Prometheus як datasource та провіжнить
дашборди з двох локацій:

- `ops/grafana/dashboards/n8n-overview.json` — n8n + Sergeant server health
- `docs/observability/dashboards/*.json` — `http-red`, `db-use`, `slo-burn-rate`, `sync`, `auth`, `ai-cost`, `hubchat`, `frontend-cwv`

Усі дашборди потрапляють у папку **Sergeant Ops** у Grafana UI. Дашборди з
`docs/observability/dashboards/` — сирі JSON-файли з `__inputs`-секцією; під
час провіженінгу Grafana 11 підставляє єдину Prometheus datasource у
`DS_PROMETHEUS`-змінну автоматично.

### Що показує `n8n-overview` dashboard

- **n8n Instance Health** — UP/DOWN, uptime, RAM, event loop lag
- **Workflow Executions** — success/error counters, rate, success rate over time
- **n8n Process Resources** — CPU, memory, heap, GC, event loop
- **Sergeant Server** — UP/DOWN, CPU, memory

### Server-side дашборди

Покладаються на recording rules з
[`docs/observability/prometheus/recording_rules.yml`](../docs/observability/prometheus/recording_rules.yml)
(особливо `slo-burn-rate.json`). Локально вони ще не вантажаться у Prometheus
— потрібно або руками скопіювати правила у `ops/prometheus/rules/`, або
дочекатись Phase 2 (Grafana Cloud — див. нижче), де `mimirtool rules sync`
це робить безболісно.

### Alert rules (Prometheus)

| Alert                 | Умова                              | Severity |
| --------------------- | ---------------------------------- | -------- |
| `N8nDown`             | n8n не відповідає 5 хв             | page     |
| `N8nWorkflowErrors`   | будь-яка помилка workflow за 15 хв | ticket   |
| `N8nHighErrorRate`    | >50% помилок за 30 хв              | page     |
| `N8nHighMemory`       | RSS >512 MB протягом 10 хв         | warning  |
| `N8nHighEventLoopLag` | event loop lag >1s протягом 5 хв   | warning  |
| `ServerDown`          | сервер не відповідає 5 хв          | page     |
| `ServerHighMemory`    | сервер RSS >512 MB протягом 10 хв  | warning  |

### Потрібні змінні в `.env.ops`

```
METRICS_TOKEN=<той самий що у .env сервера>
```

### Увімкнення метрик на Railway production

На production Railway n8n потрібно додати env vars:

```
N8N_METRICS=true
N8N_METRICS_INCLUDE_DEFAULT_METRICS=true
```

Після цього `/metrics` endpoint стане доступний для scraping.

### Prometheus targets

http://localhost:9090/targets

### Troubleshooting — метрики не збираються

1. Переконайся що `pnpm dev:server` запущений
2. Перевір збіг `METRICS_TOKEN` у `.env.ops` і `.env`
3. `curl -H "Authorization: Bearer <token>" http://localhost:3000/metrics`
4. Для n8n: `curl http://localhost:5678/metrics` (без auth)

### Phase 2 — Grafana Cloud + Alloy (production scrape)

Як тільки доходимо до публічного лаунчу
([`docs/architecture/hosting-evolution.md`](../docs/architecture/hosting-evolution.md)
§Фаза 2) — локальний `prometheus`/`grafana` лишається для дев-дебагу, а
production-метрики йдуть у Grafana Cloud free tier через лёгкого
[Grafana Alloy](https://grafana.com/docs/alloy/latest/) агента.

Конфіг агента, Dockerfile і повна інструкція деплою на Railway —
[`ops/grafana-alloy/README.md`](./grafana-alloy/README.md).

TL;DR:

```bash
# 1. Створи безкоштовний Grafana Cloud stack: https://grafana.com/auth/sign-up
# 2. Заповни у ops/.env.ops:
#    GRAFANA_CLOUD_PROMETHEUS_URL, GRAFANA_CLOUD_PROMETHEUS_USERNAME,
#    GRAFANA_CLOUD_PROMETHEUS_API_KEY (scope metrics:write)
# 3. Локальна перевірка конфіга:
docker compose -f ops/docker-compose.ops.yml --env-file ops/.env.ops --profile cloud up -d grafana-alloy
# 4. Production: задеплой ops/grafana-alloy/ як окремий Railway сервіс
```

Після того як `up{project="sergeant"} == 1` для обох targets — імпортуй
дашборди з `docs/observability/dashboards/` через Grafana Cloud UI та
завантаж recording + alert rules через `mimirtool rules sync`. Деталі — у
[`ops/grafana-alloy/README.md`](./grafana-alloy/README.md#імпорт-дашбордів-у-grafana-cloud).

## Додавання нового workflow-у

Дивись секцію «Workflow basics» у [`docs/adr/0026-n8n-workflow-source-of-truth.md`](../docs/adr/0026-n8n-workflow-source-of-truth.md) та приклади у `ops/n8n-workflows/`.

## Вартість

| Компонент            | Вартість/міс  |
| -------------------- | ------------- |
| n8n (Railway shared) | $3–5          |
| n8n Postgres         | included      |
| **Total**            | **~$3–5/міс** |
