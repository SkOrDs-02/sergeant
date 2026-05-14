# PR-план — Mobile Reliability & UX (із roast 2026-05-13)

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

PR-розклад на closeout відкритих/partial item-ів з прожарки
[`docs/audits/2026-05-13-mobile-reliability-ux-roast.md`](../audits/2026-05-13-mobile-reliability-ux-roast.md)
для скоупу `apps/mobile/**` (Expo 52 + RN 0.76) та `apps/mobile-shell/**`
(Capacitor 7 wrapper). **Out-of-scope:** SQLite-міграція Stage 8/9
(трекається у [`storage-roadmap.md`](./storage-roadmap.md) — окремі сесії).

## Cross-refs

- **Прожарка:** [`docs/audits/2026-05-13-mobile-reliability-ux-roast.md`](../audits/2026-05-13-mobile-reliability-ux-roast.md) — джерело TL;DR-болів, P1/P2/P3 розбивка, Outstanding-таблиця.
- **Living burndown:** [`docs/tech-debt/mobile.md`](../tech-debt/mobile.md) — Summary per-category, large-file inventory (>600 LOC), Roadmap-таблиця M1–M9 (статус оновлюється у момент merge кожного PR із цього плану).
- **Mobile-strategy ADR:** [`docs/adr/0052-mobile-strategy-capacitor-primary.md`](../adr/0052-mobile-strategy-capacitor-primary.md) — Capacitor primary, Expo parallel; жоден стек не deprecate-иться до окремого ADR на feature parity (≥18/22 у `docs/architecture/platforms.md`).
- **Dual-track initiative:** [`docs/initiatives/0002-mobile-platform-decision.md`](../initiatives/0002-mobile-platform-decision.md) — sunset-дати **не active commitments** на час 0010 revenue launch; quarterly recount shell-tax трекається тут.
- **Surface AGENTS:** [`apps/mobile/AGENTS.md`](../../apps/mobile/AGENTS.md) — NativeWind, MMKV-only, Expo Router gotchas; flaky-tests T7 verification (`mobile-flaky-verify.yml`).
- **Sprint context:** [`docs/planning/sprint-roadmap-q2q3-2026.md`](./sprint-roadmap-q2q3-2026.md) (§1.1 тех-борг, T7 verification, lighthouse budget).

## Глобальний sequencing

```
PR-01 (XS, dead-code)  ──────────────┐
PR-02 (S,  finyk×2)    ──────────────┤
PR-03 (M,  fizruk×4)   ──────────────┤
                                     ├──→ M3/M4 closeout у mobile.md row
PR-04 (M,  diff.ts decompose)        │
PR-05 (M,  Calendar.tsx decompose)   │
PR-06 (M-L, adapter.ts decompose)  ──┤ (наслідує pattern із PR-04)
PR-07 (M,  PlanCalendar.tsx)       ──┤
                                     ├──→ LOC>600 inventory 4 → 0
PR-08 (XS, Sentry DSN provisioning)──┘ (no-code; EAS Secret + redeploy)

PR-09 (M-L, Detox CI matrix)         (parallel; independent of decomp track)
PR-10 (S,   Shell-tax recount)       (parallel; updates 0002 trend)
```

**Track 1 (P1 cleanup):** PR-01..PR-03 закривають Outstanding M3/M4/P2.1 — короткі hygienic-PR-и, можна паралелити.
**Track 2 (P2 LOC-burndown):** PR-04..PR-07 декомпонують 4 файли >600 LOC; PR-06 (adapter.ts) залежить від PR-04 pattern.
**Track 3 (ops/observability):** PR-08 (Sentry DSN) — no-code, але потребує EAS-секрету; розблоковує M7. PR-10 — quarterly recount.
**Track 4 (e2e ops):** PR-09 — окремий ініціатив-розмірний PR на CI runner-matrix.

## PR-картки

### PR-01 · Remove dead `modules/shared/ModuleErrorBoundary.tsx` · XS · P1

- **Outstanding ID:** P2.1 (audit § P2.1)
- **Scope-files:**
  - `apps/mobile/src/modules/shared/ModuleErrorBoundary.tsx` (delete, 206 LOC)
  - `packages/eslint-plugin-sergeant-design/__tests__/no-foreign-module-accent.test.mjs` (drop fixture row for deleted file)
  - `packages/eslint-plugin-sergeant-design/index.js` (drop comment-only reference at `:1525`)
- **Acceptance:**
  - `grep -rn "modules/shared/ModuleErrorBoundary\|shared/ModuleErrorBoundary" apps/ packages/ tools/` → 0 (наразі — 2 збіги, обидва у eslint-plugin metadata).
  - `pnpm --filter @sergeant/mobile typecheck` зелений.
  - `pnpm --filter eslint-plugin-sergeant-design test` зелений (fixture-row дроп — coverage-нейтрально).
  - `pnpm --filter @sergeant/mobile test --testPathPattern=ModuleErrorBoundary` зелений (єдиний живий боундарі — `apps/mobile/src/core/ModuleErrorBoundary.tsx`, не зачіпається).
- **Estimate:** XS (≤0.5h).
- **Priority:** P1 (closes audit P2.1; зменшує surface для regressions у crash-recovery layer).
- **Dependencies:** жодних. Перед merge виконати dynamic-import grep по `require.context`/`import("modules/shared/...")` всередині `apps/mobile/app/**` (Expo Router) як safety gate.
- **Owner:** `@Skords-01` / TBD mobile-engineer.

### PR-02 · Mobile finyk domain-shape alignment × 2 · S · P1

- **Outstanding ID:** M4 (audit § P2.3; tech-debt M4)
- **Scope-files:**
  - `apps/mobile/src/modules/finyk/pages/Overview/CategoryChartSection.tsx:35`
  - `apps/mobile/src/modules/finyk/pages/Transactions/TransactionsPage.tsx:122`
  - `eslint.config.js` (drop 2 allowlist-row у `sergeant-design/no-strict-bypass` mobile block, lines ~685-690)
  - opt: `apps/mobile/src/modules/finyk/lib/toDomain.ts` (новий explicit converter, якщо domain-shape gap not trivial)
- **Acceptance:**
  - `grep -nP "as unknown as" apps/mobile/src/modules/finyk` → 0.
  - `pnpm --filter @sergeant/mobile typecheck && pnpm --filter @sergeant/mobile test --testPathPattern=finyk` зелені.
  - `pnpm lint` зелений (allowlist drift gate `sergeant-design/no-strict-bypass` не падає).
  - Snapshot-adapter для `TransactionsPage` mirror-ить shape `@sergeant/finyk-domain` (jest snapshot не змінюється або змінюється з документованою причиною у PR-описі).
- **Estimate:** S (1-2h).
- **Priority:** P1.
- **Dependencies:** жодних (independent track).
- **Owner:** `@Skords-01` / TBD mobile-engineer.

### PR-03 · Mobile fizruk domain-shape alignment × 4 · M · P1

- **Outstanding ID:** M3 (audit § P2.3; tech-debt M3)
- **Scope-files:**
  - `apps/mobile/src/modules/fizruk/components/workouts/WorkoutJournalSection.tsx:76`
  - `apps/mobile/src/modules/fizruk/hooks/useCustomExercises.ts:148`
  - `apps/mobile/src/modules/fizruk/hooks/useRecovery.ts:32`
  - `apps/mobile/src/modules/fizruk/pages/Exercise.tsx:133`
  - `eslint.config.js` (drop 4 allowlist-row у mobile-block)
  - opt: `apps/mobile/src/modules/fizruk/lib/toDomain.ts` (single converter file, mirror finyk-pattern із PR-02)
- **Acceptance:**
  - `grep -nP "as unknown as" apps/mobile/src/modules/fizruk` → 0 у production-коді.
  - `pnpm --filter @sergeant/mobile typecheck && pnpm --filter @sergeant/mobile test --testPathPattern=fizruk` зелені.
  - `pnpm lint` зелений.
  - Domain-shape використовується з `@sergeant/fizruk-domain` (`Workout`, `Exercise`, `RecoverySnapshot`) без локальних shadow-типів.
- **Estimate:** M (3-4h).
- **Priority:** P1.
- **Dependencies:** PR-02 (опціонально — для toDomain pattern reuse, не блокер).
- **Owner:** `@Skords-01` / TBD mobile-engineer.

### PR-04 · Decompose `fizruk/lib/dualWrite/diff.ts` (633 LOC) · M · P2

- **Outstanding ID:** P2.2a (audit § P2.2)
- **Scope-files:**
  - `apps/mobile/src/modules/fizruk/lib/dualWrite/diff.ts` (delete monolith)
  - `apps/mobile/src/modules/fizruk/lib/dualWrite/diff/` (new folder: `index.ts` re-export, `workoutsDiff.ts`, `dailyLogDiff.ts`, `templatesDiff.ts`, `recoveryDiff.ts`, `types.ts`, `shared.ts`)
  - `apps/mobile/src/modules/fizruk/lib/dualWrite/diff.test.ts` (split per-shape тест-файли під `diff/__tests__/`)
- **Acceptance:**
  - Кожен файл у `diff/` < 300 LOC.
  - Public surface — `diff/index.ts` — назад-сумісний за signature з поточним `diff.ts` (call-sites у `adapter.ts` не змінюються).
  - `pnpm --filter @sergeant/mobile typecheck && pnpm --filter @sergeant/mobile test --testPathPattern=fizruk/lib/dualWrite/diff` зелені.
  - `wc -l apps/mobile/src/modules/fizruk/lib/dualWrite/diff/*.ts` — max file ≤ 300 LOC; нема нового файлу >600.
- **Estimate:** M (3-4h).
- **Priority:** P2.
- **Dependencies:** жодних. Pattern — mirror `dualWrite/adapter.ts` operation-family layout (як зафіксовано у audit § P2.2).
- **Owner:** `@Skords-01` / TBD mobile-engineer.

### PR-05 · Decompose `routine/pages/Calendar.tsx` (628 LOC) · M · P2

- **Outstanding ID:** P2.2b (audit § P2.2)
- **Scope-files:**
  - `apps/mobile/src/modules/routine/pages/Calendar.tsx` (orchestrator → ≤ 300 LOC)
  - `apps/mobile/src/modules/routine/pages/Calendar/DayCell.tsx`
  - `apps/mobile/src/modules/routine/pages/Calendar/WeekHeader.tsx`
  - `apps/mobile/src/modules/routine/pages/Calendar/useCompletionAggregator.ts`
  - `apps/mobile/src/modules/routine/pages/Calendar/types.ts`
- **Acceptance:**
  - Orchestrator (`Calendar.tsx`) ≤ 300 LOC; підкомпоненти ≤ 200 LOC.
  - `pnpm --filter @sergeant/mobile typecheck && pnpm --filter @sergeant/mobile test --testPathPattern=routine` зелені.
  - Existing Detox `hub-ux-smoke.e2e.ts` Routine-крок не регрешить (manual smoke на iOS sim, screenshot у PR).
  - Tailwind / NativeWind class-list — no DOM-only utilities, `data-compact` opt-out preserved для heatmap-cells якщо існував.
- **Estimate:** M (3-4h).
- **Priority:** P2.
- **Dependencies:** жодних.
- **Owner:** `@Skords-01` / TBD mobile-engineer.

### PR-06 · Decompose `fizruk/lib/dualWrite/adapter.ts` (804 LOC) · M-L · P2

- **Outstanding ID:** P2.2d (audit § P2.2)
- **Scope-files:**
  - `apps/mobile/src/modules/fizruk/lib/dualWrite/adapter.ts` (orchestrator → ≤ 400 LOC)
  - `apps/mobile/src/modules/fizruk/lib/dualWrite/adapter/` (new folder: per operation-family — `workouts.ts`, `dailyLog.ts`, `templates.ts`, `recovery.ts`, `index.ts` re-export)
  - existing `adapter.test.ts` — split за operation-family
- **Acceptance:**
  - Orchestrator ≤ 400 LOC; per-family файли ≤ 250 LOC.
  - Public API стабільний — call-sites у `apps/mobile/src/modules/fizruk/lib/sync/**` не змінюються.
  - `pnpm --filter @sergeant/mobile typecheck && pnpm --filter @sergeant/mobile test --testPathPattern=fizruk/lib/dualWrite` зелені.
  - Жодного нового файлу >600 LOC.
- **Estimate:** M-L (4-6h).
- **Priority:** P2.
- **Dependencies:** PR-04 (pattern — diff-helpers повинні бути на місці перш ніж adapter перерозкладеться).
- **Owner:** `@Skords-01` / TBD mobile-engineer.

### PR-07 · Decompose `fizruk/pages/PlanCalendar.tsx` (661 LOC) · M · P2

- **Outstanding ID:** P2.2c (audit § P2.2)
- **Scope-files:**
  - `apps/mobile/src/modules/fizruk/pages/PlanCalendar.tsx` (orchestrator → ≤ 350 LOC)
  - `apps/mobile/src/modules/fizruk/pages/PlanCalendar/` (new folder з підкомпонентами — `WeekRow.tsx`, `DayCell.tsx`, `usePlanAggregator.ts`, `types.ts`)
- **Acceptance:**
  - Orchestrator ≤ 350 LOC; підкомпоненти ≤ 250 LOC.
  - `pnpm --filter @sergeant/mobile typecheck && pnpm --filter @sergeant/mobile test --testPathPattern=fizruk/pages/PlanCalendar` зелені.
  - Manual smoke у `hub-ux-smoke` — Fizruk plan-calendar tab не регрешить.
- **Estimate:** M (3-4h).
- **Priority:** P2.
- **Dependencies:** жодних (можна паралелити з PR-05).
- **Owner:** `@Skords-01` / TBD mobile-engineer.

### PR-08 · Sentry RN DSN provisioning · XS · P2

- **Outstanding ID:** M7 (audit § P1.5 / tech-debt M7)
- **Scope-files:** **no code change.** Operations:
  - Створити Sentry project `sergeant-mobile` (org-existing).
  - Виставити EAS Secret `EXPO_PUBLIC_SENTRY_DSN` (staging + production profiles у `eas.json`).
  - `apps/mobile/eas.json` — verify, що `env.EXPO_PUBLIC_SENTRY_DSN` referenced у `development`/`preview`/`production` profiles (якщо ні — додати referenced env var; це єдина потенційна code-change).
  - `docs/tech-debt/mobile.md` Observability row → flip "DSN ще не підключено" → "DSN provisioned `YYYY-MM-DD`" з посиланням на EAS Secret і Sentry project URL.
- **Acceptance:**
  - `eas build --profile development --platform ios --non-interactive` (dry-run) — `EXPO_PUBLIC_SENTRY_DSN` присутній у build manifest.
  - Test-crash у dev-build (manual: trigger `throw new Error("sentry-smoke")` у dev-only debug screen) → подія з'являється у Sentry project протягом 5 хв.
  - `ModuleErrorBoundary.componentDidCatch` форвардить через `captureError` (already wired 2026-05-13 у roast PR) — runtime no-op до DSN, після DSN — реальний event.
- **Estimate:** XS (≤1h, plus 1 build verification).
- **Priority:** P2 (ops-blocker; розблоковує observability для всіх 4 модулів).
- **Dependencies:** жодних (code-side вже готовий — `apps/mobile/src/lib/observability.ts`, `core/ModuleErrorBoundary.tsx`).
- **Owner:** `ops` / `@Skords-01`.

### PR-09 · Detox e2e CI matrix integration · M-L · P3

- **Outstanding ID:** P2.4 (audit § P2.4)
- **Scope-files:**
  - `.github/workflows/mobile-e2e-detox.yml` (new — GHA macOS runner, iOS sim matrix; cron + workflow_dispatch + PR-label opt-in)
  - `apps/mobile/e2e/hub-ux-smoke.e2e.ts` (existing — verify cold-start scenario green на CI-runner)
  - `apps/mobile/.detoxrc.js` (verify CI binary path)
  - `docs/planning/mobile-e2e-testing.md` — flip "впровадження не розпочато" → "Phase 1 CI-runner landed `YYYY-MM-DD`"
- **Acceptance:**
  - GHA workflow зелений на 3 послідовних runs на main (cron + manual + label-triggered).
  - Run-time ≤ 25 хв (інакше — split e2e на пом-shards або винести у nightly).
  - Failure-mode документований: на fail — annotated artifact `e2e-screenshots.zip` + Slack `#mobile` notification (через existing ops Slack webhook).
- **Estimate:** M-L (1-2d, головно CI-runner матриця і flake-stabilization).
- **Priority:** P3 (важливо для long-term reliability, але не блокер revenue launch).
- **Dependencies:** жодних (паралельно з decomp track).
- **Owner:** `ops` / TBD mobile-engineer.
- **Risk note:** macOS runner — дорогий мінутах GHA; cron-frequency обирати після baseline run-time measurement.

### PR-10 · Shell-tax quarterly recount (initiative 0002) · S · P3

- **Outstanding ID:** P2.5 (audit § P2.5)
- **Scope-files:**
  - `tools/report-shell-tax.mjs` (extend — додати `--trend` flag, що друкує 30/60/90-day moving average; baseline зчитує з committed log)
  - `docs/initiatives/0002-mobile-platform-decision.md` — нова таблиця `Shell-tax trend` (rows: 2026-02, 2026-05, 2026-08 quarterly baseline) + posting cadence.
  - `.github/workflows/shell-tax-report.yml` (existing cron — verify still зелений; нічого змінювати у workflow, тільки у скрипті).
  - opt: `docs/architecture/platforms.md` — feature-parity row recount (≥18/22 trigger gating).
- **Acceptance:**
  - `pnpm exec node tools/report-shell-tax.mjs --trend` друкує таблицю з 3 row-ами (baseline 2026-02-03 → recount 2026-05 → recount 2026-08).
  - `docs/initiatives/0002-mobile-platform-decision.md` Last validated bump-нуто (CI freshness gate).
  - Якщо feature-parity ≥18/22 — окремий issue/ADR-draft request створений (не у цьому PR).
- **Estimate:** S (1-2h).
- **Priority:** P3.
- **Dependencies:** жодних.
- **Owner:** `@Skords-01` / TBD any-engineer.

## Sequencing & batching

| Batch                             | PRs                 | Запускати                                                                                                    |
| --------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| **B-1 (week 1 — hygiene)**        | PR-01, PR-02, PR-03 | Паралельно. Реалістично 3 шт за 1-2 дні. Closeout M3+M4+P2.1.                                                |
| **B-2 (week 1-2 — LOC burndown)** | PR-04, PR-05, PR-07 | Паралельно. PR-06 — після PR-04 (depends).                                                                   |
| **B-3 (week 2 — adapter)**        | PR-06               | Після merge PR-04. Один-PR slot — найбільший із декомп-треку.                                                |
| **B-4 (ops, async)**              | PR-08, PR-10        | Паралельно з B-1..B-3. PR-08 потребує EAS Secret creation (ops). PR-10 — pure docs+script.                   |
| **B-5 (future iteration)**        | PR-09               | Окрема ініціатива, не блокує revenue launch. Запускати після B-1..B-3 — спочатку очистити, потім automation. |

**Total estimate:** 5 × M + 1 × M-L + 1 × S + 1 × XS + 1 × XS + 1 × M-L ≈ 1.5-2 спрінт-тижнів для одного mobile-engineer.

## Out-of-scope (зафіксовано, не у цьому плані)

- **SQLite Stage 8/9 migrations** — okремий трек у [`docs/planning/storage-roadmap.md`](./storage-roadmap.md) (Stage 8/9 dual-write quartet, MMKV tombstones, residual-import).
- **M9 — TS 6 bump для mobile + console** — `BLOCKED on Expo SDK 53` (tech-debt M9). Не actionable до SDK 53 release; track only.
- **AGENTS.md sub-tree refresh** — `apps/mobile/AGENTS.md` Last validated 2026-05-13, next review 2026-08-11; recount-нуто разом з прожаркою. Окремого PR не потребує.
- **`docs/architecture/platforms.md` feature-parity recount** — частково покривається PR-10, але full re-audit (≥18/22 ✅) — окремий ADR-trigger PR коли cell-count перейде поріг.

## Risks & mitigations

| #   | Ризик                                                                                                            | Mitigation                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Domain-shape alignment (PR-02 / PR-03) тригерить regressions** у finyk/fizruk через snapshot drift             | Mandatory jest snapshot-diff review у PR-описі; smoke на iOS sim перед merge; revert-готовий single-file revert (allowlist row повертається без code-changes).                           |
| R2  | **Decomp PRs (PR-04..PR-07) перевищують module-size discipline (600 LOC) у нових файлах**                        | Acceptance gate "max file ≤ 300 (300/250/350)" перевіряється `wc -l` локально + ESLint `max-lines` (Hard Rule #18 active-initiative). PR fail-gate, якщо новий файл > 600.               |
| R3  | **Sentry DSN (PR-08) — leak DSN у public repo**                                                                  | DSN не у код-коді; зберігається у EAS Secret. `apps/mobile/eas.json` посилається через `$EXPO_PUBLIC_SENTRY_DSN` env-key. Secret-scan через `pnpm lint:secrets` (gitleaks) — gate.       |
| R4  | **Detox CI (PR-09) flaky на macOS runner — false-positive PR-block**                                             | Workflow марковано як non-blocking на старті (PR-label opt-in). Перехід на required-check тільки після 3 послідовних зелених на main + week-long baseline.                               |
| R5  | **adapter.ts decomp (PR-06) ламає dualWrite contract** — silently губимо writes на mobile у Routine/Fizruk       | Pre-merge integrity test: запустити existing `dualWrite.test.ts` + manual smoke (write op → check SQLite + LS write-through). Parity probe metric `<m>.sqlite.dualwrite.parity` стежить. |
| R6  | **PR-08 — DSN provisioned, але Sentry quota exhausted** (free tier 5k events/month)                              | Перед provisioning — verify Sentry org quota; якщо лімітований — bump plan або wire sampling (1.0 → 0.25 sampleRate у `observability.ts`).                                               |
| R7  | **Shell-tax recount (PR-10) виявляє >2x growth** у dual-track maintenance                                        | Якщо trend > 2x baseline 2026-02 — trigger розмова з owner про feature-parity ADR (тригер у ADR-0052). PR сам не активує sunset — лише сигналізує.                                       |
| R8  | **Detox + Routine decomp (PR-05 + PR-09)** конфліктують — Calendar.tsx LOC-shape змінюється під час e2e-baseline | PR-05 виконати до PR-09 baseline. Якщо порядок інверсний — re-baseline screenshot у `hub-ux-smoke` після PR-05 merge.                                                                    |

## Closeout criteria для всього плану

- Outstanding-таблиця у [`docs/audits/2026-05-13-mobile-reliability-ux-roast.md`](../audits/2026-05-13-mobile-reliability-ux-roast.md) — всі рядки M3, M4, M7, P2.1, P2.2a-d, P2.4, P2.5 → `done` зі посиланням на відповідний PR (M9 лишається `BLOCKED on Expo SDK 53`).
- `docs/tech-debt/mobile.md` Roadmap-таблиця — M3, M4, M7 → done; large-file inventory: 4 → 0 файлів >600 LOC.
- `pnpm lint` зелений (Hard Rule #18 `max-lines: 600`, `sergeant-design/no-strict-bypass` без stale-entry для finyk/fizruk).
- `pnpm --filter @sergeant/mobile test` зелений; 20-run T7 flaky-verify baseline тримається 20/20.
- Sentry RN `apps/mobile` — DSN активний, perception verified manual smoke.
- ADR-0052 — `Status: Accepted` без змін; жоден з PR-ів не активує sunset-трек (feature-parity ще не ≥18/22 без окремого ADR-trigger).
