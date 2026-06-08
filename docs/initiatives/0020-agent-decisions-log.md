# 0020 — Agent decisions log

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** In progress — code-complete; залишок: live-mode usage (агент реально звіряється + maintainer курує між сесіями).
> **Agent-ready:** yes

## TL;DR

Tier 3 agent-OS. Курований append-only журнал [`docs/agents/decisions.md`](./../agents/decisions.md) усталених рішень/вподобань, який агент читає на старті (через `sergeant-start-here`), щоб не перепитувати вже вирішене, а maintainer не розжовував контекст щоразу. Тонкий **покажчик**, не паралельний source-of-truth: кожен рядок лінкує канон (AGENTS.md / ADR / rule), а не дублює його (Hard Rule #15).

## Чому зараз

- `agent:find` (0018) і `agent:route` (0019) закрили «де щось живе» і «з чого почати»; лишився третій біль — **«я ж казав минулого разу»**: між сесіями агент не пам'ятає усталених рішень.
- `CLAUDE.md`/`AGENTS.md` тримають **політику**, але не «ми вже вирішили X отак, не питай знову» рівня окремих рішень.
- Сесійні рішення (decoupling від ai_memories, harness-config поза репо, zero-deps, agent:where субсумовано) реально приймались і варті фіксації.

## Скоуп

### In scope

- `docs/agents/decisions.md` — ledger з lifecycle-маркером, формат `| Дата | Рішення | Скоуп | Канон |`, засіяний рішеннями цієї сесії.
- Промоція у `sergeant-start-here` + `docs/agents/README.md` (крок орієнтації + рядок таблиці).

### Out of scope

- Дублювання hard rules / repo policy (тільки лінк на канон — Hard Rule #15).
- Автогенерація / CI-гейт — журнал курується вручную; механічного enforcement не вводимо (рішення — не drift-артефакт).
- Машинне «навчання» вподобань — поза скоупом; це людино-курований список.

## План змін

| PR       | Що ввозиться                              | Файли                                                                  | Стан |
| -------- | ----------------------------------------- | ---------------------------------------------------------------------- | ---- |
| **PR-1** | `decisions.md` ledger + seed рішень сесії | `docs/agents/decisions.md`                                             | ✅   |
| **PR-2** | Промоція у start-here + agents/README     | `.agents/skills/sergeant-start-here/SKILL.md`, `docs/agents/README.md` | ✅   |

## Критерії DONE

- [x] `docs/agents/decisions.md` існує з lifecycle-маркером, форматом і seed-рішеннями
- [x] `sergeant-start-here` і `docs/agents/README.md` вказують читати його на старті
- [x] Кожен seed-рядок лінкує канон, не дублює політику (Hard Rule #15)
- [ ] Live: агент реально звіряється + maintainer додає ≥1 нове рішення між сесіями _(observational)_

## Ризики

| Ризик                                                     | Митигація                                                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Журнал стає паралельним SoT і розходиться з AGENTS.md** | Тільки покажчик-рядки з лінком на канон; «дозріле» рішення переноситься в канон, тут лишається лінк |
| **Журнал розростається в звалище**                        | append-only + maintainer курує; «Що сюди НЕ пишемо» секція; one-off task-рішення — у PR, не тут     |
| **Агент ігнорує файл**                                    | Промоція у start-here крок 3 (поряд з обов'язковим orientation), коротка таблиця                    |

## Власник / ETA

- **Owner:** @Skords-01
- **Implementation agent:** Claude Code
- **ETA:** code-complete; live usage — органічно між сесіями.

## Посилання

- [`docs/agents/decisions.md`](./../agents/decisions.md) — сам журнал
- [Initiative 0018](./0018-agent-semantic-retrieval.md), [Initiative 0019](./0019-agent-routing.md) — Tier 1/2 sibling-и
- [Hard Rule #15](../governance/rules/15-governance-and-doc-language.md) — single-source-of-truth + UA
