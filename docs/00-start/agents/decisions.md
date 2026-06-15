# Журнал рішень для агентів

> **Last touched:** 2026-06-15 by @Skords-01. **Next review:** 2026-09-13.
> **Status:** Active

Курований, append-only журнал **усталених рішень і вподобань**, щоб агент не перепитував те, що вже вирішено, а maintainer не розжовував контекст щоразу (Initiative 0020, Tier 3 agent-OS).

## Як це працює

- **Агент:** прочитай цей файл на старті (через `sergeant-start-here`) разом із `pnpm agent:route`. Якщо рішення тут уже зафіксоване — дій за ним, не перепитуй.
- **Maintainer:** курує список. Агент може **запропонувати** новий рядок у PR, але фінальне слово — за власником.
- **Не паралельний source-of-truth.** Це **покажчик**: коли рішення вже є політикою, рядок лінкує канон (`AGENTS.md`, ADR, rule), а не дублює його (Hard Rule #15). Коли рішення «дозріває» до політики — перенеси його в канон і залиш тут лінк.

## Формат

`| Дата | Рішення (коротко) | Скоуп | Канон / джерело |` — найновіші зверху.

## Рішення

| Дата       | Рішення                                                                                                                   | Скоуп              | Канон / джерело                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-08 | Harness-config (SessionStart-хуки, MCP-wiring, агент-дефи) **не комітимо в репо** — живе в global config харнеса          | agent-OS / repo    | [`AGENTS.md` § Harness config lives outside the repo](../../../AGENTS.md#harness-config-lives-outside-the-repo)                                                                |
| 2026-06-08 | Орієнтація перед роботою: спершу `pnpm agent:route` + `pnpm agent:find`, а не сліпий grep                                 | agent-OS           | [`0019-agent-routing.md`](../../90-work/initiatives/archive/_0019-agent-routing.md), [ADR-0066](../../04-governance/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md) |
| 2026-06-08 | `agent:where <symbol>` окремо **не робимо** — субсумовано `pnpm agent:find --type export`                                 | agent-OS           | [`0019-agent-routing.md` § Out of scope](../../90-work/initiatives/archive/_0019-agent-routing.md)                                                                             |
| 2026-06-08 | Agent-retrieval — **build-time committed індекс**, decoupled від runtime-стору `ai_memories` (per-user, потребує сервера) | agent-OS / server  | [ADR-0066 § Rationale](../../04-governance/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md)                                                                          |
| 2026-06-08 | Перевага **нуль нових залежностей** для agent-tooling (ручний JSON-RPC у MCP-сервері; TS-compiler замість ts-morph)       | agent-OS / scripts | [ADR-0059](../../04-governance/adr/0059-symbol-extraction-via-typescript-compiler-api.md)                                                                                      |

## Що сюди НЕ пишемо

- Hard rules і repo policy — їхній дім `AGENTS.md` / `docs/04-governance/governance/` (тут лише лінк, якщо рішення стало приватним вподобанням поверх політики).
- Одноразові task-рішення без довготривалого ефекту — їм місце в PR-описі, не тут.
- Секрети, токени, приватні дані.
