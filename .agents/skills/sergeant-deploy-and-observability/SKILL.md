---
name: sergeant-deploy-and-observability
description: Use when a Sergeant change touches deploy config, env vars, Railway/Vercel, health checks, Sentry, n8n, or production verification; also when editing CI/CD or Dockerfile; UA: деплой, env, Railway, Vercel, Sentry, n8n.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Деплой і обсервабіліті в Sergeant

Production-facing зміни в Sergeant не вважаються завершеними, коли код збирається. Вони завершені, коли deploy-обвʼязка, доки і runtime-верифікація все ще відповідають очікуванням Railway, Vercel, Sentry і n8n.

## Що покриває

- `railway.toml`, `vercel.json`, deploy-доки, health-endpoints
- env-зміни через web/server
- Sentry, readiness/liveness, маршрутизація алертів, release-верифікація
- operator-facing доки для деплою або реакції на інцидент

## Railway services (актуально)

Sergeant має три Railway services:

| Service | Repo source | Notes |
|---|---|---|
| `sergeant-api` | `apps/server` via `Dockerfile.api` | Primary API + auth |
| `sergeant-openclaw-gateway` | `packages/openclaw-plugin` via `Dockerfile.openclaw-gateway` | Зовнішній Telegram шлюз (ADR-0055, Node 24-alpine). Config-as-code з `ops/openclaw/` копіюється в runtime. |
| (Vercel) | `apps/web` | Frontend — auto-deploy on push |

При deploy зміни до OpenClaw Gateway: онови `ops/openclaw/` config → push → Railway auto-redeploys `sergeant-openclaw-gateway`. Детальніше — `sergeant-openclaw` скіл.

## Жорсткі правила

- Зміни env-vars трактуй як продуктові зміни: онови canonical-доки.
- Розрізняй `livez` і `readyz`; readiness може залежати від Postgres.
- Якщо змінюється поведінка деплою API або auth-у — перевір припущення same-origin proxy через Vercel `/api/*`.
- **Hard Rule #21 (Pino redaction):** логи не повинні містити PII. Нова поверхня логування → перевір [`docs/governance/logging-redaction-policy.md`](../../../docs/governance/logging-redaction-policy.md).
- Не закривай deploy-роботу без конкретного шляху верифікації.

## Верифікація

- релевантна локальна build- або test-команда
- цільовий endpoint або healthcheck усе ще збігається з доками
- env-доки оновлено у `docs/integrations/railway-vercel.md` або відповідному runbook
- припущення алертингу або Sentry усе ще тримаються, коли зміна торкається обсервабіліті
- `pnpm lint:archive-move-depth` — якщо торкався docs/archives (Hard Rule #23)

## Корисні доки

- [docs/integrations/railway-vercel.md](../../../docs/integrations/railway-vercel.md)
- [docs/observability/README.md](../../../docs/observability/README.md)
- [docs/governance/logging-redaction-policy.md](../../../docs/governance/logging-redaction-policy.md)
- [docs/playbooks/investigate-alert.md](../../../docs/playbooks/investigate-alert.md)
- [docs/adr/0055-openclaw-external-gateway.md](../../../docs/adr/0055-openclaw-external-gateway.md)
