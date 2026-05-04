# Contributing to Sergeant

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Active

`CONTRIBUTING.md` - канонічний manual для людей. Repo policy і hard rules описані в [AGENTS.md](./AGENTS.md), а repeatable execution recipes - у [docs/playbooks/README.md](./docs/playbooks/README.md).

## Перед стартом

1. Прочитай [AGENTS.md](./AGENTS.md), якщо торкаєшся коду, infra або docs governance.
2. Знайди playbook для свого сценарію в [docs/playbooks/playbook-catalog.md](./docs/playbooks/playbook-catalog.md).
3. Якщо зміна торкає API, migrations, HubChat, mobile, console agent або deploy surface, працюй за відповідним playbook від початку, а не після факту.

## Setup

Вимоги:

- Node.js `20.x`
- `pnpm 9.15.1`
- Docker для локального Postgres

```bash
git clone https://github.com/Skords-01/Sergeant.git
cd Sergeant
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:db
```

Запуск локально:

```bash
pnpm dev:server
pnpm dev:web
```

Опціонально:

- `pnpm --filter @sergeant/mobile start`
- `pnpm --filter @sergeant/console dev`

## Щоденний цикл

1. Визнач surface: `web`, `server`, `mobile`, `console`, `ops`, `docs`, `packages/*`.
2. Відкрий playbook або specialist doc для цього surface.
3. Зроби найменший узгоджений change-set.
4. Прожени verification для свого типу зміни.
5. Онови docs/governance/playbooks у тому ж PR, якщо поведінка або процес змінилися.

## Verification за типом зміни

Базовий мінімум:

```bash
pnpm lint
pnpm typecheck
```

Далі додатково за surface:

- `web`: `pnpm test`, локальний smoke через browser, за потреби `pnpm --filter @sergeant/web test`
- `server/api`: `pnpm test`, `pnpm api:check-openapi`
- `migrations`: `pnpm db:migrate`, `pnpm lint:migrations`
- `mobile`: `pnpm --filter @sergeant/mobile test`
- `console`: `pnpm --filter @sergeant/console exec vitest run`
- `governance/docs`: `pnpm docs:check-links`, `pnpm docs:check-playbook-schema`, `pnpm docs:check-playbook-index`, `pnpm lint:governance-sync --strict`

Якщо сценарій має окремий playbook, секція `Verification` у playbook має пріоритет над загальним списком вище.

## Playbooks як execution layer

Playbooks - це канонічні покрокові рецепти виконання роботи.

- Каталог: [docs/playbooks/playbook-catalog.md](./docs/playbooks/playbook-catalog.md)
- Trigger index: [docs/playbooks/INDEX.md](./docs/playbooks/INDEX.md)
- Overview і taxonomy: [docs/playbooks/README.md](./docs/playbooks/README.md)

Топові сценарії:

- API зміни: `add-api-endpoint.md`
- DB/schema зміни: `add-sql-migration.md`
- HubChat tools: `add-hubchat-tool.md`
- CI red: `fix-failing-ci.md`
- Prod incident: `hotfix-prod-regression.md`
- Alerts і деградація: `investigate-alert.md`
- Web -> mobile porting: `port-web-screen-to-mobile.md`
- Console agents: `modify-console-agent.md`
- n8n workflows: `modify-n8n-workflow.md`

## Commit і PR дисципліна

- Conventional Commits обов'язкові.
- Scope має описувати touched surface: `web`, `server`, `mobile`, `console`, `docs`, `agents`, `ops`, `shared`, `api-client`.
- Не використовуй `--no-verify`.
- Не force-push у `main`/`master`.

Перед відкриттям PR:

1. Заповни новий PR template повністю.
2. Вкажи, який skill або playbook вів роботу.
3. Переліч конкретні verification steps.
4. Перевір, чи треба було оновити `AGENTS.md`, playbook, governance doc або roadmap.

Reviewer checklist живе в [docs/governance/review-checklist.md](./docs/governance/review-checklist.md).

### Hard rules (з `AGENTS.md`)

1. **DB types: coerce `bigint` to `number` in serializers**
2. **RQ keys: only via centralized factories**
3. **API contract: server response shape ↔ `api-client` types ↔ test**
4. **SQL migrations: sequential, no gaps, two-phase for DROP**
5. **Conventional Commits: explicit scope enum**
6. **No force push to main/master**
7. **Pre-commit hooks via Husky — do not skip**
8. **Tailwind colour-opacity steps must be on the registered scale**
9. **Saturated brand fills behind `text-white` must use the `-strong` companion**
10. **Lifecycle markers — every file/doc declares its status**
11. **No arbitrary hex colors in `className`**
12. **Module-accent containment — no foreign accents inside a module subtree**
13. **No raw-palette light/dark `className` pairs**
14. **Visible focus indicators must use `focus-visible:`, not `focus:`**
15. **Read governance before coding; update docs alongside code; internal docs in Ukrainian**
16. **Typography scale — semantic styles + 12px floor**
17. **Animation budget — max 2 concurrent, 3 tiers**
18. **Module-size discipline — `max-lines: 600` for web TS/TSX**

Джерела істини:

- Human-readable contract: [AGENTS.md](./AGENTS.md)
- Machine-readable registry: [docs/governance/hard-rules.json](./docs/governance/hard-rules.json)
- Generated matrix: [docs/governance/hard-rules-matrix.md](./docs/governance/hard-rules-matrix.md)

## Governance checks

При зміні docs або process surfaces запускай:

```bash
pnpm docs:check-links
pnpm docs:check-playbook-schema
pnpm docs:check-playbook-index
pnpm lint:governance-sync --strict
pnpm lint:hard-rules-registry
pnpm hard-rules:check
pnpm lint:codeowners
pnpm lint:skills
```

При зміні `.agents/skills/<slug>/SKILL.md` додатково треба оновити SHA-256 у `.agents/skills-lock.json`:

```bash
pnpm skills:lock     # перерахує хеші та оновить lock
pnpm lint:skills     # перевірить shape + збіг хешів
```

Без `skills:lock` після правок CI впаде з повідомленням `stale computedHash`.

## Де шукати далі

- Повний doc index: [docs/README.md](./docs/README.md)
- Agent operating system: [docs/agents/README.md](./docs/agents/README.md)
- Planning/roadmaps: [docs/planning/README.md](./docs/planning/README.md)
