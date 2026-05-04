# Playbook: Modify or Add a Console Agent

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Active

**Trigger:** "Додай нового агента в Telegram bot" / "Зміни system prompt ops/marketing агента" / "Додай tool для console agent" / будь-яка зміна в `tools/console/src/agents/`.

## Owner surface

- Primary surface: `tools/console/src/agents`
- Governing skills: `sergeant-hubchat`, `sergeant-deploy-and-observability`

## Required context

- Почни з `sergeant-start-here`, потім звір `sergeant-hubchat`.
- Якщо зміна торкає runtime integrations, env vars або ops tooling, додатково звір `sergeant-deploy-and-observability`.

## Steps

### 1. Визнач тип зміни

- новий агент
- новий tool
- зміна prompt / routing
- зміна read-only data source

### 2. Тримай routing прозорим

- Router має явно знати, коли відправляти в нового агента.
- Help text, classifier hints і tests мають рухатись разом.
- Не вводь приховану магію або implicit behavior без test coverage.

### 3. Тримай tools безпечними

- Read-only за замовчуванням.
- Ніяких непомітних production mutations через bot.
- Secrets лише через env, не в prompt або code literals.

### 4. Онови prompt і constraints разом

- Tone, allowed actions, forbidden actions, response format мають бути узгоджені.
- Якщо tool змінює capability surface, це має бути відображено і в prompt, і в tests.

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm --filter @sergeant/console exec vitest run`
- [ ] Router, help text і tests синхронізовані
- [ ] Нові tools не роблять прихованих write-side effects

## When not to use this playbook

- Працюєш із HubChat всередині web app, а не з Telegram console bot.
- Змінюється лише n8n workflow або external automation.

## Related playbooks and skills

- [modify-n8n-workflow.md](./modify-n8n-workflow.md)
- [add-hubchat-tool.md](./add-hubchat-tool.md)
- Skill: `sergeant-hubchat`
- Skill: `sergeant-deploy-and-observability`
