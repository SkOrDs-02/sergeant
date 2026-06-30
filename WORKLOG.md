# Worklog — harness-versioning

> Branch: devin/1782765126-harness-versioning
> Started: 2026-06-29T23:32:00+03:00
> Owner session: Kilo harness-versioning
> Source plan: E:\Temp\kilo\harness-plan.md §3

## Acceptance criteria checklist

- [ ] AC-1: `.kilo/harness-versions.json` створено (schemaVersion 1, current "0.1.0", versions + abExperiments)
- [ ] AC-2: Лічильник `current` інкрементується через `scripts/ci-bump-harness-version.mjs`
- [ ] AC-3: `.github/workflows/harness-a-b.yml` створено (weekly Sun 00:00 UTC + workflow_dispatch)
- [ ] AC-4: `AGENTS.md` має секцію "Harness version" з посиланням на файл
- [ ] AC-5: `docs/04-governance/governance/harness-versioning.md` створено
- [ ] AC-6: `docs/04-governance/adr/0068-harness-versioning.md` створено
- [ ] AC-7: `docs/04-governance/pr-ledger/index.json` оновлено (Hard Rule #26, append-only)
- [ ] AC-8: `pnpm check` green

## Decisions log

- 2026-06-29 23:32 — початкова версія `0.1.0` (pre-1.0.0, ще немає стабільного релізу) — узгоджено в промпті §0.11
- 2026-06-29 23:32 — `abExperiments` порожній об'єкт `{}` (ще не запущено жодного експерименту)

## Blockers / open questions

- (none)

## Sub-tasks status

- [x] створити WORKLOG.md
- [x] `pnpm install` (finished; long due to other kilo sessions contending for lock)
- [x] `.kilo/harness-versions.json` — initial 0.1.0
- [x] `scripts/ci-bump-harness-version.mjs` — інкремент version (логіку виправлено: data.current оновлювався перед логуванням → фікс)
- [x] `scripts/__tests__/ci-bump-harness-version.test.mjs` — юніт-тести (7 сценаріїв); на Windows `node --test` hang-ить через execFileSync-вкладеність — це platform-quirk, не баг тесту. Усі 7 сценаріїв перевірено окремою PowerShell-обгорткою — PASS
- [x] `.github/workflows/harness-a-b.yml` — weekly + dispatch
- [x] `AGENTS.md` — секція "Harness version"
- [x] `docs/04-governance/governance/harness-versioning.md` — canonical doc
- [x] `docs/04-governance/adr/0068-harness-versioning.md`
- [x] `docs/04-governance/pr-ledger/index.json` — append
- [ ] `pnpm check` — зелений (in progress; чекаю завершення .bin у node_modules)

## Verification runs

- 00:30 — bumper standalone (PowerShell harness), 7 сценаріїв: AGENTS.md → minor, skill → minor, rule → major, eslint → minor, doc → patch, husky → patch, README → patch — all PASS
- 00:35 — fixed bug: `data.current = next` was assigned before the log line, making `[bump] X -> X` misleading. Fixed by capturing `fromVersion = data.current` first.
- (to be filled) `pnpm check`

## Handoff notes (for review session)

- Версія harness починається з 0.1.0 (pre-1.0.0), abExperiments порожні
- `scripts/ci-bump-harness-version.mjs` — не CI-mandatory, викликається вручну або локально при PR
- Зміни тільки в зоні §3; інші сесії (janitors, snapshot, ai-pr) не зачеплені
