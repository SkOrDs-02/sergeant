---
name: sergeant-module-ai
description: Use when the task touches the AI layer — hub, HubChat tools/executors/action cards, coach advice, weekly digest, ai-memory, prompt cache; UA: задача про AI-шар/HubChat/коуча/дайджест.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# AI-шар — власник модуля

Крос-модульний AI-шар: hub, HubChat (web-асистент), coach, weekly digest, ai-memory. Роутинг двовимірний: цей скіл дає продуктовий контекст і механіку шару; технічні правила поверхні бере відповідний surface-скіл. Поглинув колишній `sergeant-hubchat` — його механіка тепер тут.

## Канон і журнал (читати перед роботою)

- Канон: [docs/01-product/model/hub-coach.md](../../../docs/01-product/model/hub-coach.md), включно з **§ Журнал рішень** — рішення там уже ухвалені, не перепитуй maintainer-а.
- Розбіжності канон↔код: [docs/90-work/audits/product-knowledge-hub-coach.md](../../../docs/90-work/audits/product-knowledge-hub-coach.md).
- PR, що змінює продуктову поведінку AI-шару, оновлює канон (і журнал) **у тому ж PR** — правило `AGENTS.md § See also`.

## Мапа файлів

- Server: `apps/server/src/modules/chat/` (HubChat tool defs, prompt cache), `apps/server/src/modules/mono/` (coach), `apps/server/src/modules/digest/`, `apps/server/src/modules/ai-memory/`.
- Web (executors): `apps/web/src/core/lib/hubChatActions.ts`, `apps/web/src/core/lib/chatActions/` (per-domain executor-и: `finykActions`, `fizrukActions`, `nutritionActions`, `routineActions`, `serverActions`, `crossActions`, `query*Actions`), `apps/web/src/core/lib/hubChatActionCards.ts`.
- RQ-ключі: `hubKeys`, `coachKeys`, `chatKeys`, `digestKeys`, `aiMemoryKeys` з `apps/web/src/shared/lib/api/queryKeys.ts` (Hard Rule #2).

## HubChat: обовʼязкова координація

Tool-и визначаються на сервері, а виконуються на клієнті. Для нового або зміненого tool-а одним проходом перевір:

- `apps/server/src/modules/chat/toolDefs/*.ts` і `apps/server/src/modules/chat/tools.ts`
- `apps/web/src/core/lib/hubChatActions.ts` + фактичний executor у `apps/web/src/core/lib/chatActions/`
- `apps/web/src/core/lib/hubChatActionCards.ts`
- quick actions або risky-tool маркіровку, коли змінюється user-visible поведінка

## Жорсткі правила

- Сервер НЕ виконує chat-tool side-effect-и у `chat.ts`; клієнтські executor-и використовують наявні storage-врапери або типовані API-клієнти.
- Результати tool-ів, що повертаються моделі, — лаконічні й детерміновані.
- **Prompt cache ([ADR-0039](../../../docs/04-governance/adr/0039-anthropic-prompt-cache-policy.md) — активна політика):** breakpoint-и і TTL — `apps/server/src/modules/chat/promptCache.ts`, розкладка tools — `toolSearch.ts` (`apps/server/src/lib/anthropic.ts` — лише HTTP-врапер). У контекст їде гарячий набір (`HOT_TOOL_NAMES`), решта — `defer_loading: true`: зміна опису deferred tool-а кеш НЕ інвалідовує, гарячого — інвалідовує. Не став `cache_control` на deferred tool — Anthropic віддає 400. Бюджет префікса тримає `promptPrefixBudget.test.ts`. (ADR-0057 — Historical, не цитуй як чинну політику.)
- **Hard Rule #20:** ніяких OpenClaw PAT-ів у production (`assertStartupEnv()` захищає runtime; не обходь).

## Верифікація

- Протестуй executor-шлях і принаймні один error-шлях; перевір, чи tool слід позначити risky або відрендерити з action card.
- Зміна tool def wording → `pnpm --filter @sergeant/server test -- promptPrefixBudget toolSearch`.
- `apps/web/src/core/lib/chatActions/toolParity.test.ts` — механічний гейт: кожне ім'я з `toolDefs/` має executor у `chatActions/` і навпаки. Прогони, коли додаєш/перейменовуєш tool.

## Роутинг далі

- Технічні правила поверхні: `sergeant-server-api` / `sergeant-web-ui`.
- Делегування виконання: агент `ai-owner` (`.claude/agents/ai-owner.md`). Межа: owner працює **всередині AI-шару**; крос-поверхневу фічу по стадіях веде `sergeant-deliver-squad`.
- Playbooks: [add-hubchat-tool.md](../../../docs/00-start/playbooks/add-hubchat-tool.md), [debug-chat-tool.md](../../../docs/00-start/playbooks/debug-chat-tool.md), [enable-prompt-caching.md](../../../docs/00-start/playbooks/enable-prompt-caching.md), [tune-system-prompt.md](../../../docs/00-start/playbooks/tune-system-prompt.md).
- Каталог: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md).
