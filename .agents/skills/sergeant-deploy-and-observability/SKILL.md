---
name: sergeant-deploy-and-observability
description: Use when a Sergeant change touches deploy config, env vars, Coolify/Vercel, health checks, Sentry, or production verification; also when editing CI/CD or Dockerfile; UA: деплой, env, Coolify, Vercel, Sentry.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Деплой і обсервабіліті в Sergeant

Production-facing зміни в Sergeant не вважаються завершеними, коли код збирається. Вони завершені, коли deploy-обвʼязка, доки і runtime-верифікація все ще відповідають очікуванням Coolify (Hetzner VPS), Vercel і Sentry.

## Що покриває

- `Dockerfile.api` (root); Vercel-конфіги живуть per-app — `apps/web/vercel.json` і `apps/landing/vercel.json`, не в корені; deploy-доки, health-endpoints
- env-зміни через web/server
- Sentry, readiness/liveness, маршрутизація алертів, release-верифікація
- operator-facing доки для деплою або реакції на інцидент

## Deploy targets (актуально — AGENTS.md § «Де живе код» і § «Прод не оновлюється сам»)

CI немає (Bitbucket без pipelines, GitHub Actions не виконуються — код на GitHub заблоковано). Автодеплою на merge в `main` немає навмисно: деплой ручний, однією командою на поверхню.

| Target | Repo source | Notes |
|---|---|---|
| Coolify app `sergeant-api-v2` (Hetzner) | `apps/server` via `Dockerfile.api` | `pnpm deploy:api` тригерить Coolify API; образ білдиться на сервері, джерело з 2026-09-23 — Bitbucket напряму (`main`, read-only access key), без GHCR. Дзеркало Hetzner виведене з ланцюга і лишається резервною копією. Міграції їдуть в ENTRYPOINT (`migrate.js && exec index.js`), не в Coolify `pre_deployment_command`. Health: `/health`. |
| Vercel (`apps/web`, `apps/landing`) | `pnpm deploy:web` / `pnpm deploy:landing` | Локальний Vercel CLI без Git-інтеграції (Bitbucket-репозиторії на Hobby-тарифі не підтримуються) — pull env → build локально → deploy `--prebuilt`. Прев'ю немає, кожен запуск викочує прод. |

Дрейф main↔prod міряй через `pnpm deploy:status` (по бекенду точний, по фронту — оцінка за часом: Vercel CLI не зберігає коміт). Деплой викочує весь `main`, не тільки свою зміну — якщо розрив більший за свої коміти, спитай власника перед деплоєм.

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
