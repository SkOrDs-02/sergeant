# Перші 30 хвилин агента в Sergeant

> **Last touched:** 2026-08-31 by @Skords-01. **Next review:** 2026-12-11.
> **Status:** Active

Стартова шпаргалка для AI-агентів (Claude Code, Codex, локальні моделі) і нових контриб'юторів. Мета — за 30 хвилин довести середовище до стану «можна писати код, не порушуючи hard rules і не падаючи на pre-commit». Для повної repo policy джерело правди — [`AGENTS.md`](../../../AGENTS.md). Цей файл — навігація і `quickstart`, не паралельний source-of-truth.

## 0. Перш ніж почати

1. Прочитай [`AGENTS.md`](../../../AGENTS.md) — hard rules + module ownership map.
2. Завантаж `.agents/skills/sergeant-start-here/SKILL.md` як вхідну точку.
3. За [`agent-skills-catalog.md`](./agent-skills-catalog.md) обери **рівно один** specialist skill під поверхню зміни (web / server / mobile / hubchat / data / deploy / review / bugfix / feature).
4. Якщо для задачі є playbook у [`docs/00-start/playbooks/`](../playbooks/README.md) — він canonical recipe; не імпровізуй.

## 1. Секрети і env

**Sergeant використовує мінімальний `.env.example` (≈20 рядків) у корені репо як шаблон для `pnpm dev`, а повний reference усіх ~100 змінних — [`docs/02-engineering/integrations/env-vars.md`](../../02-engineering/integrations/env-vars.md).** Ніколи не комить `.env`, `.env.local`, `.env.secrets`.

- **Локально:** копія `.env` поряд із `.env.example`. Мінімальний набір для `pnpm dev`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY` (для HubChat), `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (для push). Опційні змінні (Sentry, PostHog, Voyage, Mono, OpenClaw, …) — дивись [`docs/02-engineering/integrations/env-vars.md`](../../02-engineering/integrations/env-vars.md) per-feature.
- **AI_QUOTA_DISABLED:** kill-switch для AI-квоти. У dev/test — `=1` (вимикає `assertAiQuota`, тобто кожен HubChat-запит проходить без перевірки бюджету). У production — **must be `=0`** (server-startup hardфайлить інакше — див. [`apps/server/src/env/env.ts`](../../../apps/server/src/env/env.ts)).
- **Production-критичні змінні:** `RESEND_API_KEY`, `MONO_WEBHOOK_SECRET`, `SENTRY_DSN_*`, `POSTHOG_API_KEY`, OAuth client IDs/secrets — НЕ комітити, навіть тестові.

## 2. Postgres + міграції

- **Підняти БД:** `pnpm db:up` (== `docker compose up -d` із [`docker-compose.yml`](../../../docker-compose.yml)). Image — `pgvector/pgvector:pg17`, не stock `postgres:17-alpine` (міграція `025_ai_memories_pgvector.sql` робить `CREATE EXTENSION vector` — alpine падає). CI workflow'и `ci.yml` і `extended-e2e.yml` пінять той же image.
- **Прогнати міграції:** `pnpm db:migrate` (== `apps/server/migrate.mjs`). Sequential `NNN_*.sql` у [`apps/server/src/migrations/`](../../../apps/server/src/migrations), без gaps. Hard Rule #4 — drop колонок робиться у **двох фазах**, deployed окремо.
- **Один-команда стартап:** `pnpm dev:db` (db:up + db:migrate).
- **Reset:** `docker compose down -v && pnpm dev:db` (стирає volume — `dev` only).

## 3. Що робити, коли CI впав на hard-rule помилці

CI hard-rules ловляться різними механізмами. Стартова навігація:

| Симптом                                                    | Куди дивитися                                                                                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint:hard-rules-registry` падає                           | Drift `AGENTS.md` ↔ [`hard-rules.json`](../../04-governance/governance/hard-rules.json) ↔ `CONTRIBUTING.md`. Прогнати `pnpm hard-rules:list` побачиш точне правило.                                                 |
| `sergeant-design/no-raw-local-storage`                     | Використовуй storage-wrapper з `@shared/storage` (`ls`, `lsSet`, `safeReadLS`) замість сирого `localStorage`. Plugin: [`packages/eslint-plugin-sergeant-design/`](../../../packages/eslint-plugin-sergeant-design). |
| `sergeant-design/rq-keys-only-from-factory` (Hard Rule #2) | RQ-ключі лише з центральних фабрик `apps/web/src/shared/lib/api/queryKeys.ts` — не inline `queryKey: [...]`.                                                                                                        |
| `sergeant-design/no-cyrillic-jsx-literal`                  | Кириличний literal у JSX поза allowlist — див. [`docs/05-design/i18n/readiness.md`](../../05-design/i18n/readiness.md).                                                                                             |
| `sergeant-design/no-flat-shared-lib`                       | Новий файл у flat `shared/lib/` заборонено — клади у тематичну підпапку (`shared/lib/<topic>/`).                                                                                                                    |
| `sergeant-design/no-hash-router-in-modules`                | Hash-навігація всередині module-коду заборонена — роутінг лише через canonical router (`apps/web/src/core/app/router.tsx`).                                                                                         |
| `commitlint` (Hard Rule #5)                                | Дозволені scope-и в `AGENTS.md` § Hard rules → правило #5. Не вигадуй нові.                                                                                                                                         |
| `docs:check-playbook-schema`                               | Trigger ≤ 240 chars, Status enum {Active, Scaffolded, Deprecated, Archived}, Verification ≥ 1 checkbox. Дивись `add-playbook.md` playbook (якщо є) або інший working playbook.                                      |

Повна enforcement-матриця — у [`hard-rules-matrix.md`](../../04-governance/governance/hard-rules-matrix.md). Категорійна семантика (`blocker-invariant` / `lint-enforced-convention` / `active-initiative`) описана в `AGENTS.md` § Hard rules intro.

## 4. Як обрати skill за тригерною фразою

`agent-skills-catalog.md` — таблиця `Scenario → skill → what it enforces`. Швидкий decision tree:

- **«додаю screen / компонент / Tailwind стиль»** → `sergeant-web-ui`.
- **«додаю/міняю API endpoint, серіалізатор, RQ ключі»** → `sergeant-server-api`.
- **«React Native / Expo screen, MMKV, Capacitor»** → `sergeant-mobile-expo`.
- **«SQL міграція, схема, query, Postgres налаштування»** → `sergeant-data-and-migrations`.
- **«HubChat tool, action card, prompt cache»** → `sergeant-module-ai`.
- **«auth, login, session cookies, Better Auth»** → `better-auth-best-practices`.
- **«deploy config, Vercel/Coolify, env vars, Sentry»** → `sergeant-deploy-and-observability`.
- **«review-and-merge / PR review / safe to ship»** → `sergeant-review-and-merge`.
- **«фіксую регресію / прод-баг / flaky test»** → `sergeant-bugfix-and-regression`.
- **«не впевнений / multi-surface / cross-package»** → `sergeant-monorepo-boundaries`.

Більше одного скіла одночасно тримати не треба — [`AGENTS.md`](../../../AGENTS.md) описує routing-disсipline.

## 4.5. Інфраструктура (оновлено 2026-07-21)

**Backend (ADR-0074):** API + Postgres + Redis на **Hetzner CX23 під Coolify**. Образ API — `ghcr.io` через `deploy-api.yml`; pre-deploy migrate — `node dist-server/migrate.js`. Railway виведено ([ADR-0074](../../04-governance/adr/0074-hosting-hetzner-coolify.md)).

**OpenClaw (ADR-0075):** повністю **decommissioned** 2026-07-20 — `tools/openclaw`, gateway, `packages/openclaw-plugin`, `ops/openclaw` прибрано з репо. Hard Rule #20 лишається (fail-closed guard проти `OPENCLAW_GITHUB_PAT` у prod). Для Telegram ops — n8n + alert bot, не OpenClaw.

**Pricing (ADR-0068):** `Free + Pro`, ₴199/₴1490, reverse trial 7d. ADR-0051 superseded.

**Agent retrieval (ADR-0081):** codebase-memory MCP (`search_graph`, `trace_path`, `get_code_snippet`); fallback — TypeScript/LSP, Knip або `rg`.

## 5. Plop generators (boilerplate без копіпаста)

- `pnpm gen:adr` — створює `docs/04-governance/adr/NNNN-<slug>.md` із валідною шапкою (Status / Date / Reviewers / Supersedes / Related). Номер обчислюється через `nextAdrNumber()` у [`plopfile.mjs`](../../../plopfile.mjs), gaps пропускаються.
- `pnpm gen new-skill` … `pnpm gen new-n8n-workflow` … — інтерактивні prompt'и зі smoke-тестами. ~~`new-console-specialist`~~ (historical OpenClaw) — **removed** разом із `tools/openclaw` (ADR-0075).

## 6. Verification before PR

Перед claim «Done» або «Ready to merge» — Iron Law gate з [`sergeant-review-and-merge`](../../../.agents/skills/sergeant-review-and-merge/SKILL.md), секція «Verification gate»: **NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.**

Мінімальний green-set перед `git push`:

```bash
pnpm lint                    # ESLint flat config + custom plugin
pnpm typecheck               # TypeScript per-app
pnpm lint:skills             # SKILL.md shape + skills-lock SHA-256
pnpm lint:hard-rules-registry  # hard-rules.json ↔ AGENTS.md ↔ CONTRIBUTING.md
pnpm docs:check-playbook-schema  # якщо торкався playbook'ів
pnpm docs:check-links        # якщо доді/змінив internal лінки
```

Husky pre-commit прогонить `lint-staged` (ESLint --fix + Prettier) і блокує commit, якщо щось не зеленіє. **Не передавай `--no-verify`** — це Hard Rule #7.

## 7. PR лайфцикл

- Один surface → один primary skill → один primary playbook.
- Conventional Commits scope з enum у `AGENTS.md` Hard Rule #5 (наприклад: `docs(agents)`, `feat(server)`, `fix(web)`).
- PR template — [`AGENTS.md`](../../../AGENTS.md) § PR template секція в Verification before PR.
- Post-PR: чекай CI. `pnpm lint` падає на новому ESLint warning'у → fix. `Markdown link checker` падає на pre-existing broken link → можна зберегти scope, але зазнач у PR description.
- Якщо CI блок через pre-existing failure (не від твоєї роботи) — окремий міні-PR-розблокувач, не міксуй scope.

## Дивись також

- [`AGENTS.md`](../../../AGENTS.md) — hard rules + module ownership + commit/PR conventions.
- [`agent-skills-catalog.md`](./agent-skills-catalog.md) — full skill routing table.
- [`agent-workflows.md`](./agent-workflows.md) — decision trees per workflow type.
- [`specialists-mapping.md`](./specialists-mapping.md) — runtime SpecialistAgent ↔ skill ↔ playbook map.
- [`docs/00-start/playbooks/README.md`](../playbooks/README.md) — execution recipes by trigger.
- [`docs/04-governance/governance/hard-rules-matrix.md`](../../04-governance/governance/hard-rules-matrix.md) — машино-читабельна enforcement-матриця.
- [`AGENTS.md` § Hard rules intro](../../../AGENTS.md#hard-rules-do-not-break) — таксономія категорій (`blocker-invariant` / `lint-enforced-convention` / `active-initiative`).
