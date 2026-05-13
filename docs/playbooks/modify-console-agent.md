# Playbook: Зміна або додавання console-агента

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

**Trigger:** "Додай нового агента в Telegram bot" / "Зміни system prompt ops/marketing агента" / "Додай tool для console agent" / будь-яка зміна в `tools/openclaw/src/agents/`.

## Owner surface

- Primary surface: `tools/openclaw/src/agents`
- Governing skills: `sergeant-hubchat`, `sergeant-deploy-and-observability`

## Required context

- Почни з `sergeant-start-here`, потім звір `sergeant-hubchat`.
- Якщо зміна торкає runtime-інтеграції, env vars або ops-тулінг, додатково звір `sergeant-deploy-and-observability`.

## Кроки

### 1. Визнач тип зміни

- новий агент
- новий tool
- зміна system-промпту або правил роутингу
- зміна read-only data source

### 2. Тримай роутинг прозорим

- Роутер має явно знати, коли відправляти в нового агента.
- Help text, classifier hints і тести мають рухатись разом.
- Не вводь приховану магію чи implicit behavior без покриття тестами.

### 3. Тримай tools безпечними

- Read-only за замовчуванням.
- Жодних непомітних production-мутацій через бота.
- Секрети — лише через env, не в промпті чи code literals.

### 4. Онови промпт і constraints разом

- Тон, allowed actions, forbidden actions, response format мають бути узгоджені.
- Якщо tool змінює capability surface — це має бути відображено і в промпті, і в тестах.

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm --filter @sergeant/openclaw exec vitest run`
- [ ] Роутер, help text і тести синхронізовані
- [ ] Нові tools не роблять прихованих write-side effects

## Коли цей playbook НЕ використовувати

- Працюєш із HubChat всередині web-додатка, а не з Telegram console-ботом — використовуй `add-hubchat-tool.md`.
- Змінюється лише n8n workflow чи external automation — використовуй `modify-n8n-workflow.md`.

## Споріднені playbook-и та skills

- [modify-n8n-workflow.md](./modify-n8n-workflow.md)
- [add-hubchat-tool.md](./add-hubchat-tool.md)
- Skill: `sergeant-hubchat`
- Skill: `sergeant-deploy-and-observability`
