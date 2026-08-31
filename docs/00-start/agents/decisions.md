# Журнал рішень для агентів

> **Last touched:** 2026-07-29 by Codex. **Next review:** 2026-10-31.
> **Status:** Active

Курований, append-only журнал **усталених рішень і вподобань**, щоб агент не перепитував те, що вже вирішено, а maintainer не розжовував контекст щоразу (Initiative 0020, Tier 3 agent-OS).

## Як це працює

- **Агент:** прочитай цей файл на старті (через `sergeant-start-here`) разом із `pnpm agent:route`. Якщо рішення тут уже зафіксоване — дій за ним, не перепитуй.
- **Maintainer:** курує список. Агент може **запропонувати** новий рядок у PR, але фінальне слово — за власником.
- **Не паралельний source-of-truth.** Це **покажчик**: коли рішення вже є політикою, рядок лінкує канон (`AGENTS.md`, ADR, rule), а не дублює його (Hard Rule #15). Коли рішення «дозріває» до політики — перенеси його в канон і залиш тут лінк.

## Формат

`| Дата | Рішення (коротко) | Скоуп | Канон / джерело |` — найновіші зверху.

## Рішення

| Дата       | Рішення                                                                                                                                                                                                          | Скоуп              | Канон / джерело                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-28 | Deprecated-вказівник `sergeant-hubchat` видаляємо цілком (тека + lock-entry + graph-вузол + 4 eval-кейси) після 2026-10-28 або раніше, щойно зникнуть зовнішні посилання на скіл                                 | agent-OS           | [спека agent-module-owners, рішення 4](../../90-work/planning/specs/archive/agent-module-owners.md)                                                                                                                                                               |
| 2026-08-28 | Модульний шар агентного OS: module-owner скіли (продуктовий контекст × surface-скіл), журнал рішень у каноні модуля, `sergeant-hubchat` поглинуто `sergeant-module-ai`                                           | agent-OS / product | [спека agent-module-owners](../../90-work/planning/specs/archive/agent-module-owners.md)                                                                                                                                                                          |
| 2026-07-29 | Не комітимо agent graph/symbol/retrieval indexes; discovery через codebase-memory MCP, fallback через TypeScript/Knip/`rg`                                                                                       | agent-OS / repo    | [ADR-0081](../../04-governance/adr/0081-repository-simplification.md)                                                                                                                                                                                             |
| 2026-06-29 | Web-first до traction: native mobile, Expo-shell і Capacitor-shell не тягнемо в launch-readiness; повертаємось до них після стабільного web і реальних користувачів                                              | product / launch   | maintainer decision; testing loop: [`production-readiness-testing-loop.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/production-readiness-testing-loop.md)                                 |
| 2026-06-08 | Harness-config (SessionStart-хуки, MCP-wiring, агент-дефи) **не комітимо в репо** — живе в global config харнеса _(винятки з 2026-07+: `.codex/`, `.mcp.json`, repo `.claude/` — див. канон)_                    | agent-OS / repo    | [`AGENTS.md` § Harness config lives outside the repo](../../../AGENTS.md#harness-config-lives-outside-the-repo)                                                                                                                                                   |
| 2026-06-08 | Орієнтація перед роботою: спершу `pnpm agent:route` + `pnpm agent:find`, а не сліпий grep _(superseded 2026-07-29: `agent:find` retired з індексами — discovery через codebase-memory MCP; `agent:route` живий)_ | agent-OS           | [`0019-agent-routing.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0019-agent-routing.md), [ADR-0066](../../04-governance/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md) |
| 2026-06-08 | `agent:where <symbol>` окремо **не робимо** — субсумовано `pnpm agent:find --type export` _(superseded 2026-07-29 разом з `agent:find` → codebase-memory MCP)_                                                   | agent-OS           | [`0019-agent-routing.md` § Out of scope](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0019-agent-routing.md)                                                                             |
| 2026-06-08 | Agent-retrieval — **build-time committed індекс**, decoupled від runtime-стору `ai_memories` (per-user, потребує сервера)                                                                                        | agent-OS / server  | [ADR-0066 § Rationale](../../04-governance/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md)                                                                                                                                                             |
| 2026-06-08 | Перевага **нуль нових залежностей** для agent-tooling (ручний JSON-RPC у MCP-сервері; TS-compiler замість ts-morph)                                                                                              | agent-OS / scripts | [ADR-0059](../../04-governance/adr/0059-symbol-extraction-via-typescript-compiler-api.md)                                                                                                                                                                         |

## Що сюди НЕ пишемо

- Hard rules і repo policy — їхній дім `AGENTS.md` / `docs/04-governance/governance/` (тут лише лінк, якщо рішення стало приватним вподобанням поверх політики).
- Одноразові task-рішення без довготривалого ефекту — їм місце в PR-описі, не тут.
- Секрети, токени, приватні дані.
