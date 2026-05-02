# @sergeant/server

Backend API Sergeant — Node 20, Express, PostgreSQL (`pg`), Better Auth, Anthropic tool-use (HubChat).

## Стек

| Шар     | Технологія                                    |
| ------- | --------------------------------------------- |
| Runtime | Node 20, TypeScript 6                         |
| HTTP    | Express, Helmet, CORS, rate limiting          |
| DB      | PostgreSQL 16, `pg` driver, SQL-міграції      |
| Auth    | Better Auth (cookie-сесії, bearer для mobile) |
| AI      | Anthropic Claude (tool-use, streaming)        |
| Тести   | Vitest + Testcontainers (real Postgres)       |

## Структура

```
src/
├── index.ts        # Entrypoint
├── app.ts          # createApp() — Express factory
├── config.ts       # Runtime config (порт, SPA-static, trust proxy)
├── auth.ts         # Better Auth setup
├── db.ts           # PostgreSQL pool, ensureSchema(), міграції
├── routes/         # Express-роутери: auth, me, sync, chat, coach, push, banks, …
├── modules/        # Бізнес-логіка: chat/ (toolDefs/), mono/, nutrition/, push/, sync/, …
├── migrations/     # 001_noop.sql … 010_*.sql (sequential, no gaps)
├── http/           # Спільний HTTP-шар (errorHandler, requireSession, rateLimit)
└── obs/            # Observability (pino logger, metrics)
```

## Команди

```bash
pnpm dev:server                                 # Express API → http://localhost:3000
pnpm db:up                                      # Docker Compose — Postgres на :5432
pnpm db:migrate                                 # Запустити SQL-міграції
pnpm --filter @sergeant/server test             # Vitest
pnpm --filter @sergeant/server test:integration # Testcontainers
pnpm --filter @sergeant/server typecheck        # TypeScript
pnpm --filter @sergeant/server build            # Production build
```

## Деплой

Railway, `Dockerfile.api`. Pre-deploy автоматично запускає `pnpm db:migrate`.

Деталі: [`docs/integrations/railway-vercel.md`](../../docs/integrations/railway-vercel.md).

## Hard rules

- **bigint → number:** `pg` повертає `bigint` як string — завжди `Number()` у serializers ([AGENTS.md #1](../../AGENTS.md)).
- **API contract:** зміна response shape → оновити `api-client` типи + snapshot-тест ([AGENTS.md #3](../../AGENTS.md)).
- **Міграції:** sequential `NNN_*.sql`, two-phase для DROP ([AGENTS.md #4](../../AGENTS.md)).

## Глибше

- [`docs/architecture/api-v1.md`](../../docs/architecture/api-v1.md)
- [`docs/tech-debt/backend.md`](../../docs/tech-debt/backend.md)
- [`docs/api/README.md`](../../docs/api/README.md) — OpenAPI spec
