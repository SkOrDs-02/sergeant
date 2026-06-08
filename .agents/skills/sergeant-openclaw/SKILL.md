---
name: sergeant-openclaw
description: Use when working on the OpenClaw Gateway service, console agent, @sergeant/openclaw-plugin package, ops/openclaw config, or Telegram bot identity; UA: OpenClaw / gateway / console-agent / openclaw-plugin / Telegram-бот.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# OpenClaw Gateway у Sergeant

OpenClaw Gateway — зовнішній Telegram-шлюз (ADR-0055). Він **не є** internal bot на Grammy. Це окремий Railway service із власним Dockerfile, пакетом-адаптером і config-as-code.

> Якщо задача — HubChat tool defs або chat executors у `apps/web` — це `sergeant-hubchat`, не цей скіл.

## Топологія (ADR-0055)

| Компонент | Шлях | Призначення |
|---|---|---|
| Пакет-адаптер | `packages/openclaw-plugin/` (`@sergeant/openclaw-plugin`) | Integration layer між Sergeant і Gateway |
| Config-as-code | `ops/openclaw/` | Копіюється в Gateway runtime при деплої |
| Railway service | `sergeant-openclaw-gateway` | Node 24-alpine, `Dockerfile.openclaw-gateway` |
| Bot identity | `@OpenClaw_sergeant_v2_bot` | Нова identity (старий Grammy-bot більше не існує) |
| Console specialists | `tools/openclaw/src/agents/<name>.ts` | Спеціалізовані агентські loop-и |

## Жорсткі правила

- **Hard Rule #20:** Ніяких PATs у production. `assertStartupEnv()` у `packages/openclaw-plugin` блокує запуск без правильних env vars — не обходь і не мокай.
- Зміна `ops/openclaw/` = продуктова зміна: онови відповідний runbook або docs якщо змінилася operator-поведінка.
- Console specialist (agent loop) має дотримуватися патерну з `ops.ts`/`marketing.ts`: system-prompt стаб + порожній `tools` array + делегація в `runAgentLoop`.
- Нові specialists → wire-up у `router.ts` і `index.ts` одним PR.

## Деплой

1. Внести зміни до `packages/openclaw-plugin/` або `ops/openclaw/`.
2. `pnpm --filter @sergeant/openclaw-plugin build` — перевірити локально.
3. Push → Railway auto-redeploys `sergeant-openclaw-gateway`.
4. Verify: healthcheck Gateway service + перевірити Telegram `@OpenClaw_sergeant_v2_bot` відповідає.

Env vars для Gateway живуть в [`docs/02-engineering/integrations/env-vars.md`](../../../docs/02-engineering/integrations/env-vars.md) в секції OpenClaw.

## Генератор нового specialist-а

```bash
pnpm gen new-console-specialist
```

Створює `tools/openclaw/src/agents/<name>.ts` + `.test.ts` і друкує next-steps для wire-up.

## Куди роутити далі

- Якщо зміна торкається HubChat tool defs або executors → також `sergeant-hubchat`
- Якщо зміна вимагає Railway env або health verification → також `sergeant-deploy-and-observability`
- Якщо потрібна нова SQL-таблиця чи міграція → `sergeant-data-and-migrations`

## Корисні доки

- [docs/00-start/playbooks/rotate-openclaw-credentials.md](../../../docs/00-start/playbooks/rotate-openclaw-credentials.md)
- [docs/00-start/playbooks/modify-console-agent.md](../../../docs/00-start/playbooks/modify-console-agent.md)
- [docs/adr/0055-openclaw-external-gateway.md](../../../docs/adr/0055-openclaw-external-gateway.md)
- [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md)
