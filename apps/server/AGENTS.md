# Agents in apps/server

> **Last validated:** 2026-05-10 by @Skords-01 / Devin. **Next review:** 2026-08-08.
> **Status:** Active

> **Single source of truth → root [`AGENTS.md`](../../AGENTS.md).** Цей файл — sub-tree quick reference для агентів, що працюють у `apps/server/`. Не дублюй repo policy: hard rules і CI matrix живуть у корені.

## Specialist skill

[`.agents/skills/sergeant-server-api/SKILL.md`](../../.agents/skills/sergeant-server-api/SKILL.md) — `apps/server`, `packages/api-client`, bigint coercion, contract triplet, Kyiv time rules. Для SQL/міграцій додатково підвантаж [`sergeant-data-and-migrations`](../../.agents/skills/sergeant-data-and-migrations/SKILL.md).

## Stack snapshot

Node 20 + Express + PostgreSQL 16 (`pg`) + Better Auth (cookie + bearer) + Anthropic Claude (tool-use, streaming). Деплой: Railway via [`Dockerfile.api`](../../Dockerfile.api). Тести: Vitest unit + Testcontainers (real Postgres) інтеграційні.

## Quick commands

```bash
pnpm dev:server                                       # http://localhost:3000
pnpm db:up                                            # docker postgres
pnpm db:migrate                                       # apply SQL migrations
pnpm --filter @sergeant/server build
pnpm --filter @sergeant/server test                   # Vitest unit
pnpm --filter @sergeant/server test:integration       # Testcontainers
pnpm --filter @sergeant/server test:coverage
pnpm --filter @sergeant/server typecheck
pnpm api:generate-openapi                             # regenerate OpenAPI on contract change
pnpm api:check-openapi                                # freshness gate (CI-blocking)
```

## Surface-specific gotchas

- **DB types (Hard Rule #1):** `pg` returns `bigint` as **string**. Coerce to `number` in serializers — never leak strings to API consumers or RQ caches.
- **API contract triplet (Hard Rule #3):** server response shape ↔ `@sergeant/api-client` types ↔ test must move together. Run `pnpm api:generate-openapi` + `pnpm api:generate-openapi-types` when shapes change; CI gates: `pnpm api:check-openapi` + `pnpm api:check-openapi-types`.
- **Migrations (Hard Rule #4):** sequential numbering, no gaps. Two-phase for `DROP` (deploy a writer that ignores the column → ship migration → remove the writer). Generator: `pnpm gen` → `migration`. Lint gate: `pnpm lint:migrations`.
- **Domain invariants:** Europe/Kyiv timezone; minor units (kopiykas) as `number` for money; user IDs are Better Auth opaque strings (not UUID). Full anti-pattern list: [`docs/architecture/domain-invariants.md`](../../docs/architecture/domain-invariants.md).
- **Logging (Hard Rule #21):** Pino redaction policy enforced — never log raw secrets, headers, PII, or request bodies that contain them. Use `apps/server/src/obs/logger.ts` redact paths.
- **Auth secrets (Hard Rule #20):** no OpenClaw PATs in production; rotate via [`docs/playbooks/rotate-secrets.md`](../../docs/playbooks/rotate-secrets.md).

## Health & deploy

`/health` p95 < 100 ms (informal SLO). Pre-deploy: `pnpm db:migrate` (requires `MIGRATE_DATABASE_URL` = public DB URL). Anthropic `/api/chat` p95 first token < 1.5 s.

## Deeper docs

- App README: [`apps/server/README.md`](./README.md)
- Domain invariants: [`docs/architecture/domain-invariants.md`](../../docs/architecture/domain-invariants.md)
- Routing catalog: [`docs/agents/agent-skills-catalog.md`](../../docs/agents/agent-skills-catalog.md)
- Better Auth wiring: [`.agents/skills/better-auth-best-practices/SKILL.md`](../../.agents/skills/better-auth-best-practices/SKILL.md)
- HubChat tool/executor coordination: [`.agents/skills/sergeant-hubchat/SKILL.md`](../../.agents/skills/sergeant-hubchat/SKILL.md)
