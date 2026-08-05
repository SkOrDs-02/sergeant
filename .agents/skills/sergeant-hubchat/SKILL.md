---
name: sergeant-hubchat
description: Use when creating, modifying, reviewing, or debugging Sergeant HubChat tool defs, executors, action cards, or chat side effects; also when editing AI prompts or stream; UA: правиш HubChat tool/executor/action card/chat.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# HubChat у Sergeant

HubChat-tool-и визначаються на сервері, а виконуються на клієнті. Коректна зміна охоплює tool definition, executor і будь-яку видиму action card або risk-маркіровку.

## Топологія

HubChat: tool defs на `apps/server`, executors на `apps/web`, дефінується контрактом між моделлю й UI. (OpenClaw Gateway — окрема зовнішня поверхня, decommissioned — [ADR-0075](../../../docs/04-governance/adr/0075-openclaw-gateway-decommissioned.md).)

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
- **Prompt cache ([ADR-0039](../../../docs/04-governance/adr/0039-anthropic-prompt-cache-policy.md) — активна політика; ADR-0057 стосувався SDK-апгрейду і має статус Historical, `apps/server` узагалі не має залежності `@anthropic-ai/sdk`):** breakpoint-и і TTL живуть у `apps/server/src/modules/chat/promptCache.ts`, розкладка tools — у `toolSearch.ts` (`apps/server/src/lib/anthropic.ts` — лише HTTP-врапер). З 2026-07-25 у контекст їде лише гарячий набір (`HOT_TOOL_NAMES`), решта — `defer_loading: true`, тож зміна опису **deferred** tool-а кеш НЕ інвалідовує; зміна гарячого — інвалідовує. Не став `cache_control` на deferred tool: Anthropic віддає 400. Бюджет префікса тримає `promptPrefixBudget.test.ts`.
- **Hard Rule #20:** Ніяких OpenClaw PAT-ів у production. `assertStartupEnv()` захищає runtime; не обходь.

## Верифікація

- Протестуй executor-шлях і принаймні один error-шлях.
- Використай задокументований curl- або local-UI flow для end-to-end виклику tool-а.
- Перевір, чи tool слід позначити risky або відрендерити з action card.
- Якщо зміна торкається tool def wording — прогони `pnpm --filter @sergeant/server test -- promptPrefixBudget toolSearch`.

## Корисні доки

- [docs/00-start/playbooks/add-hubchat-tool.md](../../../docs/00-start/playbooks/add-hubchat-tool.md)
- [docs/00-start/playbooks/debug-chat-tool.md](../../../docs/00-start/playbooks/debug-chat-tool.md)
- [docs/00-start/playbooks/enable-prompt-caching.md](../../../docs/00-start/playbooks/enable-prompt-caching.md)
- [docs/04-governance/adr/0039-anthropic-prompt-cache-policy.md](../../../docs/04-governance/adr/0039-anthropic-prompt-cache-policy.md) — канонічна політика prompt-кешу
- [docs/04-governance/adr/0057-anthropic-sdk-v1-upgrade.md](../../../docs/04-governance/adr/0057-anthropic-sdk-v1-upgrade.md) — _Historical_: SDK-апгрейд для вже видаленого `tools/console`; не цитуй як чинну політику кешу
