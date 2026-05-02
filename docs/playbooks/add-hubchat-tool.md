# Playbook: Add HubChat Tool

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** "Дай асистенту нову дію" / "Додай tool в HubChat" / зміна server tool definition, client executor або action card для HubChat orchestration.

## Owner surface

- Primary surfaces: `apps/server/src/modules/chat/**`, `apps/web/src/core/lib/chatActions/**`
- Governing skill: `sergeant-hubchat`

## Required context

- Почни з `sergeant-start-here`, потім відкрий `sergeant-hubchat`.
- Якщо tool торкає auth/session/account lifecycle, додатково звір `better-auth-best-practices`.
- Якщо tool робить persistence або API call, звір відповідний surface skill.

## Steps

### 1. Визнач tool contract

- `name`, `description`, input schema, expected side effect, short success result.
- Виріши, чи це safe tool, risky tool або purely informational tool.
- Переконайся, що tool description допомагає моделі викликати його правильно, а не рекламно описує можливість.

### 2. Додай server-side definition

- Розмісти tool у правильному `toolDefs/<domain>.ts`.
- Зберігай domain ownership: cross-module tools не клади у випадковий module.
- Перевір prompt-cache implications, якщо міняється великий shared tool list.

### 3. Додай client executor path

- Додай typed action.
- Реалізуй executor або local action handler.
- Не роби raw `localStorage`; використовуй Sergeant wrappers.
- Не ховай server-side side effects у client orchestration без явного контролю.

### 4. Додай user-facing card або feedback

- Якщо tool user-visible, онови action card/title mapping.
- Для risky tools додай proper labeling.
- Success і failure states мають відрізнятись текстом і тоном.

### 5. Додай tests і regression coverage

- Happy path.
- Error path.
- Risky labeling або tool registry shape, якщо це є частиною поведінки.

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] Tool definition, executor і card path узгоджені
- [ ] Risky tool позначено правильно, якщо застосовно
- [ ] Немає raw browser storage або несинхронізованих side effects

## When not to use this playbook

- Потрібно лише підкрутити wording system prompt без нового tool surface.
- Потрібно змінити internal Telegram console agent, а не HubChat.

## Related playbooks and skills

- [modify-console-agent.md](./modify-console-agent.md)
- Skill: `sergeant-hubchat`
- Skill: `sergeant-web-ui`
- Skill: `sergeant-server-api`
