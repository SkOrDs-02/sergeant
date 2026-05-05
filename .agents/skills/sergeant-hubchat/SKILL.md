---
name: sergeant-hubchat
description: Use when creating, modifying, reviewing, or debugging Sergeant HubChat tool defs, executors, action cards, or chat side effects; UA: правиш HubChat tool/executor/action card/chat.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# HubChat у Sergeant

HubChat-tool-и визначаються на сервері, а виконуються на клієнті. Коректна зміна охоплює tool definition, executor і будь-яку видиму action card або risk-маркіровку.

## Обовʼязкова координація

Для нового або зміненого tool-а одним проходом перевір усі релевантні шматки:

- `apps/server/src/modules/chat/toolDefs/*.ts`
- `apps/server/src/modules/chat/tools.ts`
- `apps/web/src/core/lib/hubChatActions.ts`
- `apps/web/src/core/lib/hubChatActionCards.ts`
- quick actions або risky-tool маркіровка, коли змінюється user-visible поведінка

## Жорсткі правила

- Сервер НЕ виконує chat-tool side-effect-и у `chat.ts`.
- Клієнтські executor-и мають використовувати наявні storage-врапери або типовані API-клієнти, а не ad-hoc storage.
- Результати tool-ів, що повертаються моделі, мають лишатися лаконічними і детермінованими.
- Зміна tool-визначень може інвалідовувати prompt-cache candidates; групуй wording-правки разом.

## Верифікація

- Протестуй executor-шлях і принаймні один error-шлях.
- Використай задокументований curl- або local-UI flow для end-to-end виклику tool-а.
- Перевір, чи tool слід позначити risky або відрендерити з action card.

## Корисні доки

- [docs/playbooks/add-hubchat-tool.md](../../../docs/playbooks/add-hubchat-tool.md)
- [docs/playbooks/debug-chat-tool.md](../../../docs/playbooks/debug-chat-tool.md)
- [docs/playbooks/enable-prompt-caching.md](../../../docs/playbooks/enable-prompt-caching.md)
