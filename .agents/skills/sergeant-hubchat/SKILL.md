---
name: sergeant-hubchat
description: Use when creating, modifying, reviewing, or debugging Sergeant HubChat tool defs, executors, action cards, or chat side effects; also when editing AI prompts or stream; UA: правиш HubChat tool/executor/action card/chat.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
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
- **Prompt cache (ADR-0057):** зміна tool-визначень може інвалідовувати prompt-cache candidates (`@anthropic-ai/sdk` opt-in caching, `ANTHROPIC_PROMPT_CACHE=1`). Групуй wording-правки разом; не роби часткових tool-def змін між PR-ами.
- **Hard Rule #20:** Ніяких OpenClaw PAT-ів у production. `assertStartupEnv()` захищає runtime; не обходь.

## Верифікація

- Протестуй executor-шлях і принаймні один error-шлях.
- Використай задокументований curl- або local-UI flow для end-to-end виклику tool-а.
- Перевір, чи tool слід позначити risky або відрендерити з action card.
- Якщо зміна торкається tool def wording — перевір, чи не зламаний prompt-cache кандидат.

## Корисні доки

- [docs/00-start/playbooks/add-hubchat-tool.md](../../../docs/00-start/playbooks/add-hubchat-tool.md)
- [docs/00-start/playbooks/debug-chat-tool.md](../../../docs/00-start/playbooks/debug-chat-tool.md)
- [docs/00-start/playbooks/enable-prompt-caching.md](../../../docs/00-start/playbooks/enable-prompt-caching.md)
- [docs/04-governance/adr/0057-anthropic-sdk-v1-upgrade.md](../../../docs/04-governance/adr/0057-anthropic-sdk-v1-upgrade.md) — SDK 0.95.x і prompt caching
