---
name: sergeant-deploy-and-observability
description: "Use when a Sergeant change touches deploy config, env vars, Coolify/Vercel, health checks, Sentry, or production verification; also when editing CI/CD or Dockerfile; UA: деплой, env, Coolify, Vercel, Sentry."
lang: uk
lang-reason: "Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар."
---

# Деплой і обсервабіліті в Sergeant

Production-facing зміни в Sergeant не вважаються завершеними, коли код збирається. Вони завершені, коли deploy-обвʼязка, доки і runtime-верифікація все ще відповідають очікуванням Coolify (Hetzner VPS), Vercel і Sentry.

## Що покриває

- `Dockerfile.api` (root); Vercel-конфіги живуть per-app — `apps/web/vercel.json` і `apps/landing/vercel.json`, не в корені; deploy-доки, health-endpoints
- env-зміни через web/server
- Sentry, readiness/liveness, маршрутизація алертів, release-верифікація
- operator-facing доки для деплою або реакції на інцидент

## Deploy targets (актуально — AGENTS.md § «Де живе код» і § «Прод не оновлюється сам»)

CI - GitHub Actions (`ci.yml`; на PR лише мінімальний набір, решта щотижня), з 2026-09-30 ([ADR-0102](../../../docs/governance/adr/0102-github-actions-ci-and-autodeploy.md)). Бекенд автодеплоїться лише після зелених `check`, `critical-flow`, `migration-lint`, `migration-down-drill`. Web і лендінг викочує в прод сам Vercel з `main`, без CI і без чекання бекенду.

| Target | Repo source | Notes |
|---|---|---|
| Coolify app `sergeant-api-v2` (Hetzner) | `apps/server` via `Dockerfile.api` | Автодеплой: джоба `deploy-api` у `ci.yml` -> `deploy-api.yml` (Coolify API, секрети `COOLIFY_URL`/`COOLIFY_TOKEN`; перевіряє статус, задеплоєний коміт = `github.sha` і `/health`). Запасний шлях `pnpm deploy:api`. Образ білдиться на сервері з GitHub `main`, без GHCR; дзеркало Hetzner лише резервна копія. Міграції їдуть в ENTRYPOINT (`migrate.js && exec index.js`), не в Coolify `pre_deployment_command`. Health: `/health`. |
| Vercel (`apps/web`, `apps/landing`) | GitHub `main` через Vercel Git-інтеграцію | Push у `main` викочує прод сам; `git.deploymentEnabled` у `vercel.json` вмикає лише `main` (і `beta` для web), прев'ю на PR немає, бо Hobby дає 100 деплоїв на добу. `ignoreCommand` пропускає збірку, якщо пакет не зачеплено. Відхилений за лімітом деплой Vercel не повторює: прод доганяє лише наступний push у `main` або ручний `pnpm deploy:web` / `pnpm deploy:landing` (CLI: pull env -> build -> deploy `--prebuilt`). |

Деплой-скрипти (`deploy:api`, `deploy:web`, `deploy:landing`) без `--yes` лише друкують прев'ю і виходять з кодом 0, без мережі (DG-32); викочує `pnpm deploy:api -- --yes` (так само web/landing). **Не запускай `deploy:*` заради перевірки коду** — тільки прев'ю без `--yes` чи `deploy:api -- --sync-only`.

Дрейф main↔prod міряй через `pnpm deploy:status` (по бекенду точний, по фронту — оцінка за часом: скрипт не читає коміт деплою Vercel; точний коміт видно в GitHub deployments `Production – sergeant`). Деплой викочує весь `main`, не тільки свою зміну — якщо розрив більший за свої коміти, спитай власника перед деплоєм.

OpenClaw Gateway decommissioned ([ADR-0075](../../../docs/governance/adr/0075-openclaw-gateway-decommissioned.md)) — прибрано з репо повністю, немає deploy-таргета.

## Жорсткі правила

- Зміни env-vars трактуй як продуктові зміни: онови canonical-доки.
- Розрізняй `livez` і `readyz`; readiness може залежати від Postgres.
- Якщо змінюється поведінка деплою API або auth-у — перевір припущення same-origin proxy через Vercel `/api/*`.
- **Hard Rule #21 (Pino redaction):** логи не повинні містити PII. Нова поверхня логування → перевір [`docs/governance/security/logging-redaction-policy.md`](../../../docs/governance/security/logging-redaction-policy.md).
- Не закривай deploy-роботу без конкретного шляху верифікації.

## Верифікація

- релевантна локальна build- або test-команда
- цільовий endpoint або healthcheck усе ще збігається з доками
- env-доки оновлено у `docs/engineering/integrations/railway-vercel.md` (hosting-частина superseded ADR-0074 — звіряй з ним) або відповідному runbook
- припущення алертингу або Sentry усе ще тримаються, коли зміна торкається обсервабіліті
- `pnpm lint:archive-move-depth` — якщо торкався документаційної структури; gate підтверджує відсутність локальних archive-дерев (Hard Rule #23)

## Корисні доки

- [docs/governance/adr/0074-hosting-hetzner-coolify.md](../../../docs/governance/adr/0074-hosting-hetzner-coolify.md) — актуальна backend-топологія (Hetzner + Coolify)
- [docs/engineering/integrations/railway-vercel.md](../../../docs/engineering/integrations/railway-vercel.md) — Vercel/cookie контракт (Railway-секції історичні)
- [docs/operations/observability/README.md](../../../docs/operations/observability/README.md)
- [docs/governance/security/logging-redaction-policy.md](../../../docs/governance/security/logging-redaction-policy.md)
- [docs/start/instructions/investigate-alert.md](../../../docs/start/instructions/investigate-alert.md)
