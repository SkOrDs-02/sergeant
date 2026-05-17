# Redesign v2 — кластер

> **Last validated:** 2026-05-17 by @Skords-01.
> **Next review:** оновлюється з кожним phase-wrap (див. `execution-status.md`).
> **Status:** Active rollout (Phase 1 in PR review; Phases 2–6 заплановані; Phase 7 out of scope).

Sergeant v2 редизайн (foundation merged 2026-05) ввів parallel v2 token namespace
поверх legacy `--c-*` токенів: glass surfaces, mesh background, ink-strong типографія
(Manrope display + Inter body), 22 нові Lucide icons, AIPill / InsightCard surfaces.
Legacy токени лишаються активні — нічого не зламано. Міграція — поступова.

## Документи кластера

| Файл                                           | Призначення                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`governance.md`](./governance.md)             | Контракт rollout: adapter strategy, PR sequence (PR-0…PR-8), hard-rule deltas, open questions, risks             |
| [`migration.md`](./migration.md)               | Engineer reference: BEFORE/AFTER token patterns для кожного UI-первинного шаблону. Найчастіше консультується     |
| [`execution-plan.md`](./execution-plan.md)     | Phase 0–7 breakdown: T-tasks (tokens), C-tasks (call-site swaps), F-tasks (friction), M-tasks (mobile)           |
| [`execution-status.md`](./execution-status.md) | **Live tracker** — який phase у польоті, що shipped, які знайдені розриви плану та реальності                    |
| [`backlog.md`](./backlog.md)                   | Незалежні 30-хв polish micro-PR-и (per-page glass, ChatSheet, insights wiring). Можна брати в будь-якому порядку |

## Куди йти cold

- **Перший раз у v2?** → `governance.md` (5 хв на адаптер-стратегію), далі `migration.md` для BEFORE/AFTER.
- **Стартуєш task?** → `execution-status.md` (де ми зараз) → `execution-plan.md` (інтент фази).
- **Маєш ½ години на polish?** → `backlog.md`, бери незаблоковану картку.

Канонічний контракт для нового UI-коду — [`../design-system.md`](../design-system.md).
Цей кластер описує **переходи** на v2 поверх нього, не дублює базовий контракт.
