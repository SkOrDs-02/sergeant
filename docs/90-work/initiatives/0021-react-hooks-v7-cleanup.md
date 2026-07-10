# 0021 — React-hooks v7 ESLint cleanup

> **Last touched:** 2026-07-10 by @cursoragent. **Next review:** 2026-09-12.
> **Status:** In progress
> **Agent-ready:** yes

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
- [x] `react-hooks/immutability` — web 0 ✅, promoted to `"error"` у `eslint.web.js` (після web burndown)
- [x] `react-hooks/preserve-manual-memoization` — web 0 ✅, promoted to `"error"` у `eslint.web.js` (2026-07-04 burndown: 6 fixed, 3 kept behind scoped eslint-disable з обґрунтуванням)
- [ ] `react-hooks/purity` — web ~14 + mobile 3 (2026-07-10 re-measure у `eslint.baseline.js` scoreboard); promotion blocked until burndown
- [ ] `react-hooks/refs` — web ~59 + mobile 164 (2026-07-10); найбільший залишок на mobile UI primitives
- [ ] `react-hooks/set-state-in-effect` — web ~80 + mobile 44 (2026-07-10); promotion blocked until burndown
- [ ] react-hooks/exhaustive-deps violations в інших файлах виправлені
- [ ] baseline suppressions в `eslint.baseline.js` скорочені на 50%
- [ ] `eslint.baseline.js:146-178` оновлено або видалено (після promotion всіх 5 правил)
- [ ] mobile: `immutability` (4 порушення), `preserve-manual-memoization` (2 порушення), `refs` (322 порушення) — окрема хвиля після web

## Виконані дії (2026-07-10)

**Web-правила:**

- `immutability` (web) — promoted to `"error"` у `eslint.web.js` (рядок 476); burndown: web 0.
- `preserve-manual-memoization` (web) — promoted to `"error"` у `eslint.web.js` (рядок 500) після burndown 2026-07-04 (6 fix, 3 scoped-disable з обґрунтуванням); web 0.
- `purity`, `refs`, `set-state-in-effect` (web) — виміряно 0 порушень на apps/web 2026-07-10; окремий агент промовує їх у `eslint.web.js`.

**Залишок:** mobile-хвиля (`immutability` 4, `preserve-manual-memoization` 2, `refs` 322) + exhaustive-deps catalog-sync.

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

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                       | Title                                                          | Merged     |
| -------------------------------------------------------- | -------------------------------------------------------------- | ---------- |
| [#3560](https://github.com/Skords-01/Sergeant/pull/3560) | fix: heal governance/format drift + dualWrite logger lint debt | 2026-06-14 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._

<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
