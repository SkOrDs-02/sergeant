# Fly.io vs Railway — ціни та складність міграції

> **Last validated:** 2026-05-03. **Next review:** 2026-08-01.
> **Status:** Аналіз, не потребує дій зараз.
> **Owner:** @Skords-01

## TL;DR

Railway зараз — правильний вибір. Мігрувати на Fly.io **не варто** поки трафік не зросте або не знадобиться multi-region. Fly.io дешевший на великих навантаженнях, але складніший у налаштуванні. Міграція нескладна (2-4 години), але створює ризик downtime.

## Поточний стек на Railway

| Сервіс                   | Конфігурація                    | Приблизна ціна          |
| ------------------------ | ------------------------------- | ----------------------- |
| Express API server       | Dockerfile, auto-deploy on push | ~$5–10/міс (Hobby plan) |
| PostgreSQL 16 (pgvector) | Managed, Railway-hosted         | Включено в план         |
| Redis (для BullMQ)       | Якщо є                          | ~$5/міс                 |
| **Разом**                |                                 | **~$5–20/міс**          |

Railway Hobby plan: $5/міс з $5 included usage. Pro plan: $20/міс з більшими лімітами.

## Fly.io ціни

Fly.io перейшов на pay-as-you-go (жовтень 2024). Немає фіксованих планів.

### Безкоштовно

- 3 shared-cpu-1x VM (256 MB RAM кожна)
- 3 GB persistent volume storage
- 160 GB outbound transfer/міс

### Платно

| Ресурс                         | Ціна                             |
| ------------------------------ | -------------------------------- |
| Shared CPU (1 vCPU, 256 MB)    | ~$1.94/міс                       |
| Shared CPU (1 vCPU, 1 GB)      | ~$5.70/міс                       |
| Performance CPU (1 vCPU, 2 GB) | ~$7.70/міс                       |
| Dedicated CPU (1 vCPU, 2 GB)   | ~$29/міс                         |
| Postgres (Fly-managed, 256 MB) | ~$1.94/міс                       |
| Postgres (1 GB)                | ~$5.70/міс                       |
| Volume storage                 | $0.15/GB/міс                     |
| Outbound transfer              | $0.02/GB (після 160 GB free)     |
| Redis (Upstash, managed)       | Від $0 (10k cmd/день) до $10/міс |

### Приклад: Sergeant на Fly.io

| Сервіс              | Конфігурація          | Ціна            |
| ------------------- | --------------------- | --------------- |
| Express API         | shared-cpu-1x, 512 MB | ~$3.50/міс      |
| PostgreSQL 16       | Fly Postgres, 1 GB    | ~$5.70/міс      |
| Redis               | Upstash Redis         | $0–10/міс       |
| Volume (DB backups) | 5 GB                  | $0.75/міс       |
| **Разом**           |                       | **~$10–20/міс** |

### Порівняння цін

| Навантаження            | Railway      | Fly.io         | Переможець |
| ----------------------- | ------------ | -------------- | ---------- |
| Hobby (1 user, light)   | $5/міс       | $0 (free tier) | Fly.io     |
| Small (10-50 users)     | $5–20/міс    | $10–20/міс     | ~Однаково  |
| Medium (100-1000 users) | $20–50/міс   | $15–35/міс     | Fly.io     |
| Multi-region            | Не підтримує | Нативно        | Fly.io     |

## Переваги Fly.io над Railway

1. **Multi-region:** 35+ регіонів. VM працює ближче до користувача. Railway — тільки один регіон.
2. **Autoscaling:** Scale to zero (не платити коли нема трафіку) або автоматично масштабувати.
3. **Granular контроль:** Вибір CPU, RAM, регіонів, volumes, networking.
4. **Private networking:** VM-и спілкуються через внутрішню мережу (WireGuard) без public internet.
5. **Prometheus/Grafana:** Вбудовані метрики (у нас вже є prom-client — підключається натив).

## Переваги Railway над Fly.io

1. **Простота:** Push to GitHub → auto deploy. Нульова конфігурація.
2. **Preview environments:** Автоматичні preview на PR (як Vercel).
3. **UI/UX:** Кращий dashboard, логи, метрики з коробки.
4. **Managed PostgreSQL:** Простіший backup/restore ніж Fly Postgres.
5. **Team collaboration:** Environments, variable groups, team access.
6. **Менше DevOps:** Не потрібно писати `fly.toml`, Dockerfile оптимізації, health checks.

## Складність міграції

### Що потрібно зробити

| Крок                                   | Складність | Час          |
| -------------------------------------- | ---------- | ------------ |
| 1. Встановити `flyctl` CLI             | Тривіальна | 5 хв         |
| 2. Створити `fly.toml` конфігурацію    | Низька     | 30 хв        |
| 3. Створити Fly Postgres кластер       | Низька     | 15 хв        |
| 4. Мігрувати дані з Railway PostgreSQL | Середня    | 1 год        |
| 5. Налаштувати env variables           | Низька     | 15 хв        |
| 6. Налаштувати Redis (Upstash)         | Низька     | 15 хв        |
| 7. Оновити DNS / домени                | Низька     | 15 хв        |
| 8. Оновити CI/CD (GitHub Actions)      | Низька     | 30 хв        |
| 9. Тестування + перемикання            | Середня    | 1 год        |
| **Разом**                              |            | **~3-4 год** |

### Приклад fly.toml

```toml
app = "sergeant-api"
primary_region = "waw"  # Warsaw — найближче до Києва

[build]
  dockerfile = "Dockerfile.api"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true   # Scale to zero
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512

[checks]
  [checks.health]
    port = 3000
    type = "http"
    interval = "15s"
    timeout = "2s"
    path = "/health"
```

### Міграція бази даних

```bash
# 1. Створити Fly Postgres
fly postgres create --name sergeant-db --region waw --vm-size shared-cpu-1x

# 2. Дамп з Railway
pg_dump $RAILWAY_DATABASE_URL > backup.sql

# 3. Restore на Fly
fly proxy 5433:5432 -a sergeant-db &
psql postgres://postgres:$FLY_PG_PASSWORD@localhost:5433/sergeant < backup.sql
```

### Головний ризик: Fly Postgres

Fly Postgres — це **не managed database**. Це PostgreSQL у VM, яку ти сам адмініструєш:

- Бекапи — треба налаштувати самому (або використати `fly pg backup`)
- Failover — треба налаштувати replicas
- Оновлення PostgreSQL — ручне

**Альтернатива:** Використати Neon або Supabase як managed PostgreSQL, а Fly тільки для compute. Це дасть найкраще з обох світів.

## Рекомендація

### Зараз (2026 Q2): залишитися на Railway

- Проєкт на стадії активної розробки, один розробник
- Railway простіший, менше DevOps overhead
- Ціна прийнятна ($5–20/міс)
- Preview environments корисні для PR review

### Коли мігрувати на Fly.io

Переглянути рішення коли:

- [ ] З'являться реальні користувачі з різних регіонів (multi-region потреба)
- [ ] Railway стане дорожче $50/міс
- [ ] Потрібний scale-to-zero (зараз Railway не підтримує)
- [ ] Потрібна більша гнучкість (custom health checks, blue-green deploys)

### Якщо вирішити мігрувати

1. Використати Fly для compute + Neon/Supabase для managed PostgreSQL
2. Мігрувати в maintenance window (вихідні)
3. Тримати Railway як fallback ще тиждень
4. Оновити `docs/deploy/` документацію
