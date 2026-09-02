# @sergeant/server

Backend API Sergeant — Node 22, Express, PostgreSQL (`pg`), Better Auth, Anthropic tool-use (HubChat) і Voyage embeddings (AI memory).

## Стек

| Шар     | Технологія                                                                |
| ------- | ------------------------------------------------------------------------- |
| Runtime | Node 22, TypeScript 6                                                     |
| HTTP    | Express, Helmet, CORS, rate limiting                                      |
| DB      | PostgreSQL 17 локально / 18 у проді (pgvector), `pg` driver, SQL-міграції |
| Auth    | Better Auth (cookie-сесії, bearer для mobile)                             |
| AI      | Anthropic Claude (tool-use, streaming), Voyage AI embeddings              |
| Тести   | Vitest + Testcontainers (real Postgres)                                   |

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
├── migrations/     # 001_noop.sql … 103_*.sql (sequential, no gaps)
├── http/           # Спільний HTTP-шар (errorHandler, requireSession, rateLimit)
└── obs/            # Observability (pino logger, metrics)
```

## Команди

Усі скрипти `package.json`; з кореня — `pnpm --filter @sergeant/server <script>`. База: `pnpm dev:db` (= `db:up` + `db:migrate`) у корені.

```bash
pnpm --filter @sergeant/server dev                   # API з `tsx` і `.env` → http://localhost:3000; з кореня — `pnpm dev:server`
pnpm --filter @sergeant/server build                 # esbuild-бандл у `dist-server/` (`build.mjs`)
pnpm --filter @sergeant/server start                 # запуск зібраного `dist-server/index.js`
pnpm --filter @sergeant/server lint                  # ESLint
pnpm --filter @sergeant/server typecheck             # TypeScript
pnpm --filter @sergeant/server test                  # Vitest (unit)
pnpm --filter @sergeant/server test:integration      # Vitest + Testcontainers (Postgres)
pnpm --filter @sergeant/server test:rag-eval         # RAG-eval сьют (`vitest.rag-eval.config.ts`)
pnpm --filter @sergeant/server test:tool-eval        # eval вибору chat-tool-ів + покриття tool-ів
pnpm --filter @sergeant/server test:coverage         # Vitest з покриттям
pnpm --filter @sergeant/server mutation:normalizers  # Stryker mutation-тести нормалайзерів
pnpm --filter @sergeant/server db:migrate            # SQL-міграції зі збірки (`dist-server/migrate.js`) — так само в pre-deploy Coolify
pnpm --filter @sergeant/server db:migrate:dev        # SQL-міграції з сорсів через `tsx` (локально)
pnpm --filter @sergeant/server reencrypt:tokens      # ротація ключа шифрування токенів (`scripts/token-reencrypt-rollover.ts`)
pnpm --filter @sergeant/server eval:models           # оцінка моделей (`scripts/model-eval.ts`)
pnpm --filter @sergeant/server eval:tools            # eval вибору tool-ів на корпусі
pnpm --filter @sergeant/server eval:stream           # перевірка стрімінгу відповідей чату
pnpm --filter @sergeant/server eval:vision           # eval розпізнавання фото (vision)
pnpm --filter @sergeant/server rag-eval:embed        # побудова ембедингів для RAG-eval корпусу
pnpm --filter @sergeant/server eval:tools:judge      # LLM-judge поверх результатів `eval:tools`
pnpm --filter @sergeant/server rag-eval:live         # RAG-eval проти живого API
```

## Деплой

Hetzner + Coolify ([ADR-0074](../../docs/04-governance/adr/0074-hosting-hetzner-coolify.md)): образ збирає `deploy-api.yml` → GHCR із `Dockerfile.api`, Coolify тягне й деплоїть. Pre-deploy: `pre_deployment_command = node dist-server/migrate.js` (потребує `MIGRATE_DATABASE_URL`).

Деталі: [`docs/02-engineering/integrations/railway-vercel.md`](../../docs/02-engineering/integrations/railway-vercel.md).

### Trust proxy (`TRUST_PROXY`)

`config.ts` читає `process.env.TRUST_PROXY` і передає у `app.set("trust proxy", …)`. Дефолт — `1` для Coolify (його reverse-proxy додає рівно один hop у `X-Forwarded-For`).

Коли і як міняти:

| Сценарій                      | Значення                                |
| ----------------------------- | --------------------------------------- |
| Тільки Coolify (default)      | не задавати, або `TRUST_PROXY=1`        |
| Cloudflare → Coolify          | `TRUST_PROXY=2`                         |
| AWS ALB → ECS                 | `TRUST_PROXY=2` або CIDR ALB            |
| Internal-only (no edge proxy) | `TRUST_PROXY=false`                     |
| Multi-edge з відомими IP      | `TRUST_PROXY=10.0.0.0/8,192.168.0.0/16` |

`TRUST_PROXY=true` **навмисно заборонено** — це робить кожен `req.ip` client-controlled і знеосмислює rate-limit / audit-логи. `parseTrustProxy` падає з помилкою при boot-у. Деталі: [`docs/04-governance/security/hardening/M2-trust-proxy-parameterize.md`](../../docs/04-governance/security/hardening/archive/M2-trust-proxy-parameterize.md).

## Hard rules

- **bigint → number:** `pg` повертає `bigint` як string — завжди `Number()` у serializers ([AGENTS.md #1](../../AGENTS.md)).
- **API contract:** зміна response shape → оновити `api-client` типи + snapshot-тест ([AGENTS.md #3](../../AGENTS.md)).
- **Міграції:** sequential `NNN_*.sql`, two-phase для DROP ([AGENTS.md #4](../../AGENTS.md)).

## Глибше

- [`docs/02-engineering/architecture/api-v1.md`](../../docs/02-engineering/architecture/api-v1.md)
- [`docs/90-work/tech-debt/backend.md`](../../docs/90-work/tech-debt/backend.md)
- [`docs/02-engineering/api/README.md`](../../docs/02-engineering/api/README.md) — OpenAPI spec
