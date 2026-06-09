# 0021 — React-hooks v7 ESLint cleanup

> **Last validated:** 2026-06-09 by @claude. **Next review:** 2026-09-09.
> **Status:** Proposed
> **Agent-ready:** needs-decision

## Проблема

`eslint.baseline.js:146-178` містить ~152 вимкнених `react-hooks/*` правил (set-state-in-effect 78, refs 37, purity 17, тощо) без власника, тикету чи дати закриття. Це блокує підняття severity react-hooks/v7 до `error` у всьому репо.

## Скоуп

- Аудит усіх ~152 inline-disables і baseline suppressions
- Категоризація: свідомі (з документованою причиною) vs. технічний борг
- Поетапне виправлення або документування кожного suppression
- Фінальне видалення з eslint.baseline.js

## Acceptance criteria

- [ ] Кожен suppression має або inline-коментар з поясненням, або PR що його прибирає
- [ ] `react-hooks/*` правила у eslint.baseline.js скорочені щонайменше на 50%
- [ ] `eslint.baseline.js:146-178` оновлено або видалено

## Timeline

Починати не раніше Sprint 9 (2026-07-07). Ціль: закрити до 2026-09-09.
