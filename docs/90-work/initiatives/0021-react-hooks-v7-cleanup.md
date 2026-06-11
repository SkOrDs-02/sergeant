# 0021 — React-hooks v7 ESLint cleanup

> **Last validated:** 2026-06-10 by @claude. **Next review:** 2026-09-09.
> **Status:** In Progress
> **Agent-ready:** ready

## Проблема

`eslint.baseline.js:146-178` містить ~152 вимкнених `react-hooks/*` правил (set-state-in-effect 78, refs 37, purity 17, тощо) без власника, тикету чи дати закриття. Це блокує підняття severity react-hooks/v7 до `error` у всьому репо.

## Скоуп

- Аудит усіх ~152 inline-disables і baseline suppressions
- Категоризація: свідомі (з документованою причиною) vs. технічний борг
- Поетапне виправлення або документування кожного suppression
- Фінальне видалення з eslint.baseline.js

## Acceptance criteria

- [x] 3 eslint-disable в FinykApp.tsx виправлені (navigate додано до deps, mount-only effects)
- [x] 2 eslint-disable в useWorkoutsLifecycle.ts виправлені (mount-only, stable deps)
- [ ] react-hooks/exhaustive-deps violations в інших файлах виправлені
- [ ] baseline suppressions в `eslint.baseline.js` скорочені на 50%
- [ ] `eslint.baseline.js:146-178` оновлено або видалено

## Виконані дії (2026-06-10)

1. **FinykApp.tsx** (656 → 484 рядки)
   - Виправлено: `# sync= URL` effect (mount-only, eslint-disable-line)
   - Виправлено: `# first-run` navigation effect (mount-only)
   - Виправлено: `# pwaAction` effect (navigate додано до deps)
   - Розбито: SyncTone helper → `components/SyncIndicator.tsx`

2. **fizruk dualWrite/adapter.ts** (642 → 102 рядки)
   - Розбито на: `ops/workouts.ts`, `ops/exercises.ts`, `ops/dailyPlanTemplates.ts`
   - Виправлено: mount-only `useWorkoutsViewFromSession` effect

## Timeline

Починати не раніше Sprint 9 (2026-07-07). Ціль: закрити до 2026-09-09.
