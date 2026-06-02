# Audit runner report

> **Last validated:** 2026-06-02 by audits-runner workflow. **Next review:** 2026-08-01.
> **Status:** Reference

## TL;DR

- Drift+archive pass on branch `claude/agent-spawns-drift-archive-prs-LNdws`: ~24 code items shipped across finyk / fizruk / progress-body / errors-PWA / hub / observability / nutrition / routine; ~11 originally-targeted items були вже зроблені до старту (pure drift, лише doc-закриття).
- Двоє audit-ів переведено у `archive/` як completed-and-frozen: `2026-05-07-app-audit.md` (13/13) і `2026-05-13-backend-performance-roast.md` (14/14).
- README index ресинхронізовано: 5 лічильників, 11 доданих index-рядків, footnote ⁴ (D2/D3) + ⁵ (S8/S11) виправлено; open-work перераховано 86 → 84 (Аудити 23 → 21).

## Executed this run

~24 code items shipped on `claude/agent-spawns-drift-archive-prs-LNdws`:

- **Finyk (page-audit-05):** re-render зменшення + a11y (parseLocalDate, opacity, emoji, pills touch targets, F25 tracker).
- **Fizruk (page-audit-06/07):** type-safety (non-null assertion прибрано), progress/body cleanup, a11y, Measurements empty-state.
- **Errors / PWA / Marketing (page-audit-10):** `/offline` route, visibility-handling, analytics fidelity, hop-by-hop header guard.
- **Hub (page-audit-02/03):** a11y (BarChart aria-label), telemetry fired-once, head-guard, touch targets.
- **Observability (security-observability-roast):** S9 Sentry init tags + shared request-id boundary helper.
- **Nutrition / Routine (page-audit-08/09):** a11y, copy-tone, AI-context markers, invalidate-scope, drag-guard, i18n, tuple typing.

**Found ALREADY-DONE (~11 drift items):** app-audit env-example warnings; backend-roast metrics §6 (PR #2933); auth-onb F1/F19 (`text-error` → `text-danger`); db-schema umbrella `./migrate` drop (TL;DR #7 + P2-3); doc-hygiene#1 date canonicalization; security-observability S5/S10; security-observability S8 + S11 (verified closed). These needed only doc-status flips, no code.

## Archived this run

- `docs/audits/2026-05-07-app-audit.md` → `docs/audits/archive/2026-05-07-app-audit.md`. Status → Archived; closure note (13/13: 11 §10 follow-ups + A1/A2 Sentry). Tracker → `2026-05-07-full-app-regression-ux-audit.md`.
- `docs/audits/2026-05-13-backend-performance-roast.md` → `docs/audits/archive/2026-05-13-backend-performance-roast.md`. Status → Archived; closure note (14/14 actionable; SQLite Stage 8/9 explicitly out-of-scope). P2-3 inline marker `❌ Не в цьому PR` → `✅ Closed`. Tracker → `pr-plan-backend-perf-2026-05.md`.

Inbound links across `docs/` repointed to the `archive/` paths (audit roasts, planning PR-plans, sprint-9-10, storage-roadmap).

## Drift corrected

README index (`docs/audits/README.md`):

- Counter re-syncs: security-observability `8/11` → `10/11` (S9 only); testing-devx `8/14` → `~11/14` (P0-2 mutation CI + P2-5 turbo parallel + Detox expansion); dead-code `13/17` → `15/17` (P1.4 env burn-down done, P1.5 non-actionable); web-frontend-ergonomics `3/7` → `5/7` (F5 [FIXED] + F6 #2743); deep-audit Outstanding `3` → `2`; ux-roast-pr-plan `10/41` → `20/41`.
- 11 missing index rows added (Active, honest ≈ counters): page-audit 01/02/03/05/06/07/08/09/10 + consolidated + full-app-regression.
- Footnote ⁴: D2 closed (#2933) + D3 closed (startup guard + tests, 2026-05-17); only D1/D4 remain.
- Footnote ⁵: S8 (scrubPII + test) + S11 (full CSP-directive parity test) verified closed; only S9 remains.
- Footnote ³: P1.4 done (env-single-source-budget.json 2026-06-01 sweep), P1.5 non-actionable.
- Lifecycle header bumped to 2026-06-02 / next review 2026-08-01.

open-work (`docs/open-work.md`): app-audit + backend-performance rows removed (now Archived → excluded); counts 86 → 84, Аудити 23 → 21.

## Still open / plan-first

Larger items deferred (need ADR / plan-first / scoped PRs):

- Consolidated audit CI-gate Themes 2 / 4 / 5 / 6 (touch targets, palette tokens, storage-key codemod, lifecycle-marker gate).
- Dead-code P1.1 (knip deps sweep) + P1.3 (77 unused exports + 51 duplicates).
- Deep-audit D1 (Stripe webhook e2e, PR #2872) + D4 (ADR freshness backfill, PR #2874).
- Web-frontend-ergonomics F2-II + F4 + F7.
- Nutrition uom-conversion F15.
- Component splits: `RecipesCard`, `RoutineCalendarPanel`, `Progress`.
- hub-chat F3 Zod allow-list full server mirror, C2 SW per-user cache hardening (audit-10 F2 e2e still deferred).
