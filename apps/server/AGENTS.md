# Agents in apps/server

> **Last touched:** 2026-08-27 by @Skords-01. **Next review:** 2026-12-23.
> **Status:** Active

> **Single source of truth → root [`AGENTS.md`](../../AGENTS.md).** Цей файл — sub-tree quick reference для агентів, що працюють у `apps/server/`. Не дублюй repo policy: hard rules і CI matrix живуть у корені.

## Specialist skill

[`.agents/skills/sergeant-server-api/SKILL.md`](../../.agents/skills/sergeant-server-api/SKILL.md) — `apps/server`, `packages/api-client`, bigint coercion, contract triplet, Kyiv time rules. Для SQL/міграцій додатково підвантаж [`sergeant-data-and-migrations`](../../.agents/skills/sergeant-data-and-migrations/SKILL.md).

## Stack snapshot

Node 22 + Express + PostgreSQL 18 (pgvector, `pg`) + Better Auth (cookie + bearer) + Anthropic Claude (tool-use, streaming) + Voyage embeddings (AI memory). Деплой: Hetzner CX23 + Coolify — образ `ghcr.io/.../sergeant-api` (GitHub Actions [`deploy-api.yml`](../../.github/workflows/deploy-api.yml)); [`Dockerfile.api`](../../Dockerfile.api) без змін. Rationale: [ADR-0074](../../docs/04-governance/adr/0074-hosting-hetzner-coolify.md). Тести: Vitest unit + Testcontainers (real Postgres) інтеграційні.

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
- **API contract triplet (Hard Rule #3):** server response shape ↔ `@sergeant/api-client` types ↔ test must move together. Run `pnpm api:generate-openapi` when shapes change (types in `packages/api-client/src/endpoints/*` are hand-written); CI gate: `pnpm api:check-openapi`.
- **Migrations (Hard Rule #4):** sequential numbering, no gaps. Two-phase for `DROP` (deploy a writer that ignores the column → ship migration → remove the writer). Generator: `pnpm gen` → `migration`. Lint gate: `pnpm lint:migrations`.
- **Domain invariants:** Europe/Kyiv timezone; minor units (kopiykas) as `number` for money; user IDs are Better Auth opaque strings (not UUID). Full anti-pattern list: [`docs/02-engineering/architecture/domain-invariants.md`](../../docs/02-engineering/architecture/domain-invariants.md).
- **Logging (Hard Rule #21):** Pino redaction policy enforced — never log raw secrets, headers, PII, or request bodies that contain them. Use `apps/server/src/obs/logger.ts` redact paths.
- **Auth secrets (Hard Rule #20):** no OpenClaw PATs in production; rotate via [`docs/00-start/playbooks/rotate-secrets.md`](../../docs/00-start/playbooks/rotate-secrets.md).

## Health & deploy

`/health` p95 < 100 ms (formalized: [`SLO.md § 2.1`](../../docs/03-operations/observability/SLO.md#21-health-endpoint-p95); alert-правило `BackendHealthP95High` визначене в `prometheus/alert_rules.yml` і, за [`SLO.md § Wired сьогодні`](../../docs/03-operations/observability/SLO.md), залите в Grafana Cloud Mimir та evaluating — SLO.md є єдиним джерелом істини щодо wiring. Живу доставку алертів підтверджуй у Grafana UI: `grafana-alloy`-скрейпер має історію cost-паузи). Health-probe віддає сам Node через Coolify proxy; pre-deploy міграції — Coolify `pre_deployment_command = node dist-server/migrate.js` (дзеркало колишнього `railway.toml` → `[deploy].preDeployCommand`). **Coolify-івський health check (`health_check_enabled`) вмикай лише на образі, який містить `/bin/wget`** — перевірка виконується всередині контейнера, а distroless-runtime без нього завалює КОЖЕН деплой і відкочує навіть справний (інцидент 2026-08-06; фікс — `COPY … /bin/wget` у [`Dockerfile.api`](../../Dockerfile.api)). Pre-deploy виконує міграції (requires `MIGRATE_DATABASE_URL`). **На Coolify це те саме значення, що й `DATABASE_URL`** — внутрішнє імʼя контейнера бази, публічного порту в неї немає. Окрема змінна лишилась із часів Railway, де pre-deploy виконувався поза внутрішньою мережею й потребував публічного URL; тут `pre_deployment_command` крутиться на тій самій мережі. Наслідок для діагностики: **з робочої машини ця база недосяжна** — SQL проганяй у терміналі ресурсу Postgres у Coolify. Деталі — [ADR-0074](../../docs/04-governance/adr/0074-hosting-hetzner-coolify.md). Anthropic `/api/chat` p95 first token < 1.5 s. AI memory endpoints require `VOYAGE_API_KEY` when `AI_MEMORY_ENABLED=true`.

**Деплой не замовлено ≠ деплой не потрібен (інцидент 2026-08-18 → 08-24).** Крок «Trigger Coolify deploy» у [`deploy-api.yml`](../../.github/workflows/deploy-api.yml) стояв під `continue-on-error`, і коли hook почав віддавати `401`, джоба лишалась зеленою. Образи справно збирались і лягали в `ghcr.io`, а на VPS шість днів крутився старий контейнер — жоден мерж у `main` не доїжджав. Тепер крок **фейлить джобу** на будь-якому не-2xx: образ на той момент уже запушено, тож червона джоба нічого не руйнує, а повідомляє рівно один факт — деплой не замовлено. `continue-on-error` сюди не повертати.

**Редирект від хука — це не відмова авторизації, і `-L` його не лікує.** Після перевипуску токена 2026-08-24 хук віддав не `401`, а **`302`**. Це інша хвороба: 3xx означає, що запит потрапив не на API-ендпоінт, а на веб-роут Coolify, і Laravel відкинув неавторизовану сесію на сторінку входу — тобто винен URL у `COOLIFY_DEPLOY_WEBHOOK`, а не токен. Дві типові причини: схема `http://` (Coolify підіймає на `https://` редиректом) або адреса застосунку з UI замість `/api/v1/deploy?uuid=…`. **Очевидний «фікс» через `curl -L` тут строго заборонений:** сторінка входу віддає `200 HTML`, тож із `-L` крок відрапортував би «деплой замовлено», не замовивши його — рівно те мовчазне зелене, яке цей крок і лікує. Тому 3xx лишається відмовою з власною підказкою в job summary. Окремий урок про діагностику: у першій версії підказки гілки для 3xx не було, і власник побачив пояснення лише про `401/403` та `000` — **список причин, у якому немає твого випадку, гірший за відсутність списку**, бо веде перевіряти справний токен.

**`401` від `/api/v1/deploy` — теж не синонім «протух токен».** Коли URL виправлено і запит доходить до API, кандидатів чотири, і лише перший про строк дії: (1) токен відкликано/перевипущено, а секрет старий; (2) **API вимкнено** глобально (Settings → API → Enable API) — тоді 401 віддає будь-який `/api/v1/*`; (3) **IP-allowlist** на API не містить діапазонів GitHub-раннерів — це класика «з ноутбука працює, з CI ні», і саме її найлегше проґавити; (4) у токена немає права **deploy**. Розділювальний тест — той самий `curl` зі своєї машини: пройшов там, але не в CI → це allowlist. Окремо крок обрізає пробіли й перенос рядка в `COOLIFY_DEPLOY_TOKEN` і **каже про це вголос**: вставлений із буфера токен із `\n` ламає Bearer-заголовок і виглядає точно як протухлий, тож без цієї підказки перевипускають справний токен.

**Схему після деплою перевіряй, а не припускай.** `/health` (readyz) зелений, поки відповідає БД — він нічого не знає про міграції. Розбіжність «образ ↔ база» показує `/healthz`: він порівнює накочені міграції з тими, що є в образі, і на pending віддає `503` зі списком. Саме так знайшлось, що після редеплою 08-24 накотилась 123, а 124 — ні. Той самий чек є в [`smoke-tests.json`](../../scripts/smoke-tests.json) як `diag:healthz` (tier `critical`), але спрацьовує він рідко: [`post-deploy-smoke.yml`](../../.github/workflows/post-deploy-smoke.yml) тригериться на `deployment_status`, якого Coolify не шле, тож після деплою не запускається — лишається нічний cron і ручний `workflow_dispatch`.

**І цей чек сам був зламаний — третій випадок «завжди червоне = вимкнений гейт» поспіль.** Оголошені форми відповідей розійшлися з фактичними: пʼять probe-ів (`/livez`, `/health/liveness`, `/readyz`, `/health`, `/startupz`) віддають ПЛАЙН-ТЕКСТ `ok`, а конфіг чекав JSON `{ok: boolean}` — тобто ловив `json_parse_error` замість перевірки; `/healthz`, `/health/workers` і `/api/status` віддають `{status, timestamp, …}`, а конфіг чекав `{ok, db}`. Заміряно на живому проді 2026-08-24: зі старим конфігом **8 із 15 тестів падали з `shape_mismatch` на цілком здоровому сервісі**, з новим ті самі 8 зелені. Для текстових probe-ів тепер `expectedBodyContains`, а не `shape` — `shape` на не-JSON тілі не може дати нічого, крім помилки розбору. Правиш ендпоінт — став форму сюди тим самим заміром, а не з памʼяті.

## Deeper docs

- App README: [`apps/server/README.md`](./README.md)
- Domain invariants: [`docs/02-engineering/architecture/domain-invariants.md`](../../docs/02-engineering/architecture/domain-invariants.md)
- Routing catalog: [`docs/00-start/agents/agent-skills-catalog.md`](../../docs/00-start/agents/agent-skills-catalog.md)
- Better Auth wiring: [`.agents/skills/better-auth-best-practices/SKILL.md`](../../.agents/skills/better-auth-best-practices/SKILL.md)
- HubChat tool/executor coordination: [`.agents/skills/sergeant-module-ai/SKILL.md`](../../.agents/skills/sergeant-module-ai/SKILL.md)
