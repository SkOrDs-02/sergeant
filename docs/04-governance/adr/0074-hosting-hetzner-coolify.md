# ADR-0074: Backend hosting — Hetzner VPS + Coolify (замість Railway)

- **Status:** accepted
- **Date:** 2026-07-11
- **Reviewers:** @SkOrDs-02
- **Supersedes:** ADR-0009
- **Related:**
  - [ADR-0009](./0009-hosting-split-railway-vercel.md) — попередній split Railway + Vercel (superseded цим ADR у частині бекенду).
  - [`.github/workflows/deploy-api.yml`](../../../.github/workflows/deploy-api.yml) — CI-білд образу → ghcr.io.
  - [`Dockerfile.api`](../../../Dockerfile.api) — distroless multi-stage образ (без змін при міграції).
  - [`apps/web/middleware.ts`](../../../apps/web/middleware.ts) — Edge middleware, `/api/*` proxy (без змін; змінюється лише Vercel env `BACKEND_URL`).

---

## 0. TL;DR

Бекенд-стек Sergeant (API + Postgres + Redis) переїхав з **Railway** на **один
Hetzner CX23 VPS під Coolify** (self-hosted PaaS). Причина — Railway usage-білінг
($20–50/міс і зростав із навантаженням) при нульовому prod-трафіку невиправданий;
Hetzner CX23 — фіксовані ~$7/міс. **Vercel лишається** як хостинг фронту + edge-proxy
(топологія same-origin cookies з ADR-0009 не змінилась — переписано лише Vercel env
`BACKEND_URL`). Дані перенесено `pg_dump`/`pg_restore` без втрат.

| Що                  | Було (Railway)              | Стало (Hetzner + Coolify)                  |
| ------------------- | --------------------------- | ------------------------------------------ |
| API (`apps/server`) | Railway container           | Coolify Docker-image app (образ з ghcr.io) |
| Postgres + pgvector | Railway Postgres            | Coolify Postgres `pgvector/pgvector:pg18`  |
| Redis               | Railway Redis               | Coolify Redis `redis:7.2`                  |
| Web + edge-proxy    | Vercel                      | **Vercel (без змін)**                      |
| Логи / Sentry       | Grafana Cloud Loki + Sentry | **без змін** (env перенесено)              |
| Ціна                | ~$20–50/міс usage           | ~$7/міс фіксовано                          |

---

## ADR-74.1 — VPS + Coolify замість Railway

### Context

ADR-0009 §9.2 обрав Railway за persistent-process + internal Postgres + pre-deploy
міграції, свідомо відкинувши self-hosted VPS через ops-overhead для single-maintainer.
Два фактори змінили баланс:

1. **Ціна.** Railway перейшов на usage-білінг (окремі лічильники RAM/CPU за API +
   Postgres, невдовзі + Redis). $20–50/міс і зростає — при нульовому prod-трафіку
   економічно невиправдано.
2. **Coolify** усуває більшість ops-overhead-у, який лякав у ADR-0009: git/registry-
   інтеграцію, автоматичний Let's Encrypt SSL, scheduled БД-бекапи, pre-deploy
   команди, healthcheck-моніторинг дає self-hosted PaaS-шар «з коробки».

Вимоги до хостингу з ADR-9.2 лишаються (persistent SSE, in-process BullMQ + поллери,
in-memory session-cache, Postgres з pgvector, стабільний публічний URL для платіжних
вебхуків) — serverless так само не підходить.

### Decision

**Hetzner CX23** (2 vCPU / 4 GB / 40 GB, Helsinki, Ubuntu LTS) під **Coolify**
(self-hosted) несе весь бекенд-стек одним VPS:

- **API** — Coolify Docker-image app, образ `ghcr.io/<owner>/sergeant-api`, який
  білдить GitHub Actions ([`deploy-api.yml`](../../../.github/workflows/deploy-api.yml))
  на push у `main`. Білд **у CI, не на VPS** — 4 GB RAM замало для pnpm-білда монорепи.
- **Postgres** — `pgvector/pgvector:pg18` (мажорна версія збігається з Railway PG18 —
  критично для `pg_restore`; розширення `vector` для міграції `025_ai_memories_pgvector`).
- **Redis** — `redis:7.2` (BullMQ).
- Pre-deploy міграції — Coolify `pre_deployment_command = node dist-server/migrate.js`
  (дзеркало колишнього `railway.toml` → `[deploy].preDeployCommand`).
- **Домен API** — тимчасово `api.<ip>.sslip.io` (Let's Encrypt через Coolify), поки
  не придбано власний домен; тоді → `api.<prod-домен>`. Vercel `BACKEND_URL` вказує сюди.

### Consequences

**Позитивні:**

- Фіксовані ~$7/міс замість зростаючого usage-білінгу.
- Повний контроль над стеком (версії Postgres/Redis, ресурси, бекапи).
- Vercel-топологія same-origin cookies (ADR-9.1/9.3) недоторкана — cutover це лише
  зміна Vercel env `BACKEND_URL` + redeploy, оборотна (rollback = вказати назад).

**Негативні / нові ops-обовʼязки:**

- Один VPS = single point of failure без автоматичного failover (прийнятно для
  personal-PWA з нульовим трафіком; горизонтальне масштабування — поза скоупом, як і в ADR-9.2).
- SSH/сервер-харденінг тепер наш (key-only, ufw, fail2ban, unattended-upgrades — зроблено).
- **`TRUST_PROXY`** розрахований на Railway edge (1 hop); на Coolify ланцюг
  `Vercel edge → Traefik → app` інший — `req.ip` для rate-limit-by-IP може вказувати
  на проксі, не клієнта. Безпечний бік (trust менше, не більше). **Follow-up:**
  відкалібрувати hop-count по логах у Loki, коли піде трафік.

**Нейтральні:**

- distroless-образ не має `curl`/`wget`, тож Coolify container-healthcheck вимкнено
  (`health_check_enabled=false`) — Railway теж робив зовнішній HTTP-probe, а не
  container HEALTHCHECK. Реальний `/health` віддає сам Node через Coolify proxy.
- postgres:18 офіційний образ переніс mount на `/var/lib/postgresql`; Coolify ще
  монтує `/var/lib/postgresql/data` → потрібен env `PGDATA=/var/lib/postgresql/data/pgdata`.

### Alternatives considered

- **Лишитись на Railway.** Відкинуто — usage-білінг при нульовому трафіку.
- **Fly.io / Render.** Той самий клас керованого хостингу з білінгом; не вирішує проблему ціни.
- **Fotbo VPS.** R-СТАРТ замалий (2.5 GB/15 GB); R-BASIC — малий реселер без репутації
  для платіжного бекенда. Відкинуто на користь Hetzner (репутація + ресурси + ціна).
- **VPS без Coolify (systemd + nginx вручну).** Саме той ops-overhead, який лякав у
  ADR-9.2; Coolify його усуває.

### Exit criteria

Рішення переглядається, якщо:

- Потрібен horizontal scaling (> 1 instance) — тоді shared session store + multi-node ADR.
- Один VPS перестає тримати навантаження (RAM/CPU tiск при рості трафіку) — vertical bump
  або рознесення сервісів.
- Coolify стане ops-тягарем більшим за економію проти керованого хостингу.

---

## Implementation tracker

| Arte-fact                                                               | Статус |
| ----------------------------------------------------------------------- | ------ |
| [`deploy-api.yml`](../../../.github/workflows/deploy-api.yml) → ghcr.io | live   |
| Hetzner CX23 + Coolify + харденінг                                      | live   |
| Postgres `pgvector:pg18` + перенос даних (`pg_dump`/`pg_restore`)       | live   |
| Redis `redis:7.2`                                                       | live   |
| API app (env + pre-deploy migrate + sslip.io HTTPS)                     | live   |
| Vercel `BACKEND_URL` cutover                                            | live   |
| Власний домен замість sslip.io                                          | TBD    |
| `TRUST_PROXY` калібрування під Traefik                                  | TBD    |
| Видалення Railway-проєкту                                               | TBD    |
| Local Loki/Grafana на VPS (опційно; поки Grafana Cloud)                 | TBD    |

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                        | Merged     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------- |
| [#250](https://github.com/Skords-01/Sergeant/pull/250) | docs(root): add ADR-0074 backend hosting Hetzner/Coolify, supersede ADR-0009 | 2026-07-11 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
