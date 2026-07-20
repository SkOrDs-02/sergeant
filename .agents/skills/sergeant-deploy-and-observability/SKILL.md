---
name: sergeant-deploy-and-observability
description: Use when a Sergeant change touches deploy config, env vars, Coolify/Vercel, health checks, Sentry, n8n, or production verification; also when editing CI/CD or Dockerfile; UA: деплой, env, Coolify, Vercel, Sentry, n8n.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Деплой і обсервабіліті в Sergeant

Production-facing зміни в Sergeant не вважаються завершеними, коли код збирається. Вони завершені, коли deploy-обвʼязка, доки і runtime-верифікація все ще відповідають очікуванням Coolify (Hetzner VPS), Vercel, Sentry і n8n.

## Що покриває

- `Dockerfile.api` + `.github/workflows/deploy-api.yml`, `vercel.json`, deploy-доки, health-endpoints
- env-зміни через web/server
- Sentry, readiness/liveness, маршрутизація алертів, release-верифікація
- operator-facing доки для деплою або реакції на інцидент

## Deploy targets (актуально — ADR-0074)

Бекенд-стек (API + Postgres + Redis) з 2026-07 живе на **Hetzner CX23 VPS під Coolify** (ADR-0074, superseded ADR-0009 у частині бекенду). Railway виведено повністю (config-файли `railway*.toml` видалено з репо):

| Target | Repo source | Notes |
|---|---|---|
| Coolify app `sergeant-api` (Hetzner) | `apps/server` via `Dockerfile.api` | Образ білдить GitHub Actions (`deploy-api.yml`) → `ghcr.io`; Coolify тягне й деплоїть. Pre-deploy: `node dist-server/migrate.js` (потребує `MIGRATE_DATABASE_URL`). Health: `/health`. |
| Vercel | `apps/web` | Frontend + edge-proxy `/api/*` — auto-deploy on push. Same-origin cookie топологія з ADR-0009 не змінилась. |

OpenClaw Gateway decommissioned ([ADR-0075](../../../docs/04-governance/adr/0075-openclaw-gateway-decommissioned.md)) — прибрано з репо повністю, немає deploy-таргета.

## Жорсткі правила

- Зміни env-vars трактуй як продуктові зміни: онови canonical-доки.
- Розрізняй `livez` і `readyz`; readiness може залежати від Postgres.
- Якщо змінюється поведінка деплою API або auth-у — перевір припущення same-origin proxy через Vercel `/api/*`.
- **Hard Rule #21 (Pino redaction):** логи не повинні містити PII. Нова поверхня логування → перевір [`docs/04-governance/security/logging-redaction-policy.md`](../../../docs/04-governance/security/logging-redaction-policy.md).
- Не закривай deploy-роботу без конкретного шляху верифікації.

## Верифікація

- релевантна локальна build- або test-команда
- цільовий endpoint або healthcheck усе ще збігається з доками
- env-доки оновлено у `docs/02-engineering/integrations/railway-vercel.md` (hosting-частина superseded ADR-0074 — звіряй з ним) або відповідному runbook
- припущення алертингу або Sentry усе ще тримаються, коли зміна торкається обсервабіліті
- `pnpm lint:archive-move-depth` — якщо торкався docs/archives (Hard Rule #23)

## Корисні доки

- [docs/04-governance/adr/0074-hosting-hetzner-coolify.md](../../../docs/04-governance/adr/0074-hosting-hetzner-coolify.md) — актуальна backend-топологія (Hetzner + Coolify)
- [docs/02-engineering/integrations/railway-vercel.md](../../../docs/02-engineering/integrations/railway-vercel.md) — Vercel/cookie контракт (Railway-секції історичні)
- [docs/03-operations/observability/README.md](../../../docs/03-operations/observability/README.md)
- [docs/04-governance/security/logging-redaction-policy.md](../../../docs/04-governance/security/logging-redaction-policy.md)
- [docs/00-start/playbooks/investigate-alert.md](../../../docs/00-start/playbooks/investigate-alert.md)
