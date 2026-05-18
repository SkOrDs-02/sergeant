---
name: Redesign v2 — alignment audit (code ↔ план ↔ мокапи)
type: audit
date: 2026-05-18
generated_by: council-v4 (5 ролей)
---

# Redesign v2 — Alignment Audit, 2026-05-18

> **Last validated:** 2026-05-18 by council-v4 (orchestrator + 4 sonnet specialists + opus critic).
> **Next review:** після P1 (план-корекції) — очікувано до 2026-05-25.
> **Status:** Active.
> **Companion docs:** [`execution-plan.md`](./execution-plan.md) · [`execution-status.md`](./execution-status.md) · [`backlog.md`](./backlog.md) · [`handoff.md`](./handoff.md).

## Meta

| Field             | Value                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Roles             | current-code-auditor (sonnet), redesign-v2-planner (sonnet), mockup-reviewer (sonnet), marketing-ux (sonnet), critic (opus) |
| Rounds            | 2 (R3 не тригернувся — unresolved пункти конвертовано в Open Questions)                                                     |
| Final confidences | auditor 8, planner 6 (↓ з 8 — чесна знахідка пористості), mockup-reviewer 8, marketing-ux 8, critic 7                       |
| Scope             | Весь `apps/web/src` (поточний код) vs `docs/design/redesign-v2/` (план) vs `mockups/` (Claude-design мокапи)                |

## TL;DR (5 буллетів)

1. **План стале:** `execution-plan.md` лістує `CounterReveal`+`HeroValueLine` в Phase 4.1 «create», але вони реально шиплені в PR #2969 (Phase 2.0). Будь-який агент, що читає план cold, ризикує re-create.
2. **Fizruk єдиний модуль не на MeshBackground** — `apps/web/src/modules/fizruk/FizrukApp.tsx:121` досі `<ModuleShell>`. План у `governance.md:74` декларує покриття 4 шеллів через PR-6, але live-код суперечить. Семантика PR-6 (wrap ModuleShell vs replace) — open question.
3. **11 поверхонь у дизайн-лімбо без phase-owner:** 6 mockup-novel (`nudges`, `push`, `quick-add`, `states`, `responsive`, `details-pattern`) + 5 code-orphan (`FeatureSpotlight`, `QuickActionsMenu`, `CelebrationModal`, `StreakProtection`, `InsightCard`). З них 2 (`CelebrationModal`, `StreakProtection`) doubly orphaned — ні плану, ні мокапа.
4. **Маркетинг/лендинг/прайсинг повністю поза планом без явного exclusion.** 3 landing-directions (v1-soft-organic / v2-bento-modular / v3-editorial) — production-fidelity (v2 = 851 рядків HTML), жодна не залочена. Прайсинг-сторінки мокапа немає взагалі.
5. **`useCelebration()` hook готовий** (`CelebrationModal.tsx:407`) — wow-момент після signup конвертується з дизайн-запиту в 1-PR wiring.

> **Caveat:** фази P1–P4 нижче — sequencing-only. Acceptance criteria для них пишуться під час P1 plan-doc correction; це навмисно (council recipe), не повторення антипатерну з §D10.

---

## Decisions

### D1 — execution-plan.md Phase 4.1 застаріле

**Statement:** Перейменувати «create CounterReveal + HeroValueLine primitives» (Phase 4.1) на «wire existing primitives» — вони вже існують у `apps/web/src/shared/components/ui/` після PR #2969.

**Rationale:** `auditor R1 Bucket A item 10` підтверджує: primitives існують у `shared/` з повним type/story coverage, але ZERO consumers у feature code. `planner R1 finding #1` цитує сам plan-doc divergence.

**Supporters:** planner (R1), auditor (R1+R2). Cross-role coverage: plan-doc reader + code-state reader.
**Confidence:** 9/10.

### D2 — Fizruk shell migration — real gap, не покрите PR-6

**Statement:** `FizrukApp.tsx` досі обгорнутий `<ModuleShell module="fizruk">`, на відміну від `FinykApp`, `RoutineApp`, `NutritionApp`, які мігровано на `MeshBackground`. План декларує покриття, live-код суперечить.

**Rationale:** `auditor R1+R2` цитує `apps/web/src/modules/fizruk/FizrukApp.tsx:121`. `planner R2 yielded`: «Peer-A's finding is consistent with interpretation (b) [PR-6 was partial, Fizruk specifically was not migrated]».

**Supporters:** auditor (R1+R2 з file:line), planner (R2 yielded).
**Confidence:** 8/10. Залишається Q1 — чи PR-6 wrap ModuleShell внутрішньо, чи Fizruk просто пропущений.

### D3 — 6 novel mockup surfaces без phase-owner

**Statement:** Поверхні з повноцінними мокапами, але без слота у плані: `mockups/product/nudges/`, `push/`, `quick-add/`, `states/`, `details-pattern.html`, `responsive.html`.

**Rationale:** `mockup-reviewer R1` — повний інвентар. `planner R2`: «grep across all redesign-v2/ docs returns zero hits for 'push', 'nudges/', 'details-pattern', 'responsive' as a mockup surface». Виняток — `quick-add` згадано один раз у `execution-status.md:94` як «product change, not quick win» (deferred, не unowned, але без phase).

**Supporters:** mockup-reviewer (R1+R2 з grep), planner (R2 grep yielded).
**Confidence:** 9/10.

### D4 — 5 code orphans без consumers; 2 з них doubly orphaned

**Statement:** У `apps/web/src/shared/components/ui/` existують + експортовані, але ZERO consumers у feature code: `FeatureSpotlight`, `QuickActionsMenu`, `CelebrationModal`, `StreakProtection`, `InsightCard`. З них `CelebrationModal` і `StreakProtection` також не мають мокапа (doubly orphaned).

**Rationale:** `auditor R1 Bucket C` items 2-6 з шляхами. `mockup-reviewer R2`: «CelebrationModal and StreakProtection have NO mockup and NO plan entry — they are doubly orphaned. Someone built UI that neither design nor planning asked for».

**Supporters:** auditor (R1+R2 з file:line), mockup-reviewer (R2 cross-check).
**Confidence:** 9/10.

### D5 — Маркетинг/лендинг/прайсинг повністю поза планом без explicit exclusion

**Statement:** Жоден doc у `docs/design/redesign-v2/` не згадує landing / pricing / marketing surfaces. Це implicit exclusion, не documented exclusion.

**Rationale:** `marketing-ux R1` — FTUX assessment. `planner R2`: «grep of all redesign-v2/ docs for 'landing', 'pricing', 'marketing', 'signup' returns no results in execution-plan.md, execution-status.md, execution-brief.md, or governance.md». Єдиний хіт — `backlog.md:8` — трактує лендинг як зовнішній blocker context, не scope item.

**Supporters:** marketing-ux (R1+R2), planner (R2 grep).
**Confidence:** 9/10.

### D6 — 3 landing directions production-fidelity, жодна не залочена

**Statement:** `mockups/landing/directions/` містить 3 архітектурно дивергентні напрямки (soft-organic / bento-modular / editorial), жоден не залочений як канон. Блокує downstream marketing assets.

**Rationale:** `marketing-ux R1` — порівняння tier'ів. `mockup-reviewer R2 verified`: «v2-bento-modular.html is 851 lines, includes full nav, hero, bento grid, features section, email signup form, footer. It is NOT a sketch».

**Supporters:** marketing-ux (R1+R2), mockup-reviewer (R2 file verification).
**Confidence:** 9/10.

### D7 — NutritionDashboard bypasses `--c-chart-nutrition` CSS var

**Statement:** `apps/web/src/modules/nutrition/components/NutritionDashboard.tsx:6` і `DailyPlanMacros.tsx:5` імпортують `chartHex` static hex values з `@sergeant/design-tokens/tokens` замість CSS var `--c-chart-nutrition`. Macro rings не реагують на HC/dark token pivots.

**Rationale:** `auditor R1 Bucket C item 7` з file refs. `planner` не має слота для token-alignment у v2 phase list (R1 implicit).

**Supporters:** auditor (R1 з file:line), planner (R2 implicit — token не в фазі).
**Confidence:** 8/10.

**RESOLVED 2026-05-18 (token source inspected):** **D7 framing був неточний — chartHex НЕ є bypass для `--c-chart-nutrition`.** Per `packages/design-tokens/tokens.js:294-302`, `chartHex` = окремий **macro-nutrient palette** (`kcal: orange-500`, `protein: blue-500`, `fat: yellow-500`, `carbs: green-500`) + universal chart roles (`primary: indigo-500`, `limit: red`, `neutral: slate-400`). Заміна на `rgb(var(--c-chart-nutrition))` (один-колір-на-модуль) втратила б differentiation між 4 макросами у Macro Ring / DailyPlanMacros progress bars. Реальне питання — чи треба theme-aware pivot для macro кольорів (orange/blue/yellow/green можуть viglyadat надто saturated у dark mode). Це окрема дизайн-розмова, НЕ просто token swap. **Action:** залишити `chartHex` як є; якщо у dogfooding виявиться dark-mode saturation issue — створити нову задачу «macro contrast pivot» з 4 нових `--c-macro-{kcal,protein,fat,carbs}` × 4 theme scopes. Closing D7 as audit misclassification.

### D8 — Signup wow-moment = wire `useCelebration()`, не дизайн-запит

**Statement:** Замість «design post-submit celebration» → «wire `useCelebration().success("Ти в списку!", "Перший крок зроблено — чекай на доступ")` on email-submit-success event». 1-PR замість дизайн-цикла.

**Rationale:** `marketing-ux R2 verified`: «useCelebration() hook exists at line 407 of `apps/web/src/shared/components/ui/CelebrationModal.tsx` with `success()`, `achievement()`, `goalCompleted()`, `levelUp()` shorthand helpers, all with `autoCloseMs` configured». `auditor R1` listed CelebrationModal в Bucket C.

**Supporters:** marketing-ux (R2 file:line), auditor (R1 hook noted).
**Confidence:** 8/10. i18n untested (нова турбота).

### D9 — Phases 3/5/6 zero acceptance criteria

**Statement:** `execution-plan.md` Phase 3 (Friction F1-F6), Phase 5 (Insights wiring 9 triggers), Phase 6 (Expensa 6.1-6.7) — жодна задача не має measurable acceptance: ні step-count target (F1), ні activation-rate (P5), ні visual reference (P6).

**Rationale:** `planner R1 finding #2` documents це як plan defect. `critic R0 watchlist` pre-registered цей анти-патерн.

**Supporters:** planner (R1+R2), critic (R0 — supporting role, не decorative).
**Confidence:** 9/10.

### D10 — StrategyPage entirely outside design system

**Statement:** `apps/web/src/pages/strategy/StrategyPage.tsx` (284 LOC) використовує ZERO DS: `text-2xl font-semibold`, `bg-blue-600`. Self-tagged `@scaffolded`/`@nextStep PR-35+`. Жодна згадка у redesign-v2 docs.

**Rationale:** `auditor R1+R2 confidence 9` з file:line. `planner R2` grep підтверджує zero plan mentions.

**Supporters:** auditor (R1+R2 file:line), planner (R2 grep).
**Confidence:** 9/10.

---

## Open Questions

### Q1 — PR-6 semantics: Fizruk migration scope

**Text:** Чи PR-6 (#2908) мав мігрувати `FizrukApp` root chrome на `MeshBackground`, чи обгорнути `ModuleShell` внутрішньо? Resolution requires PR diff read.
**Blocks:** D2 remediation path, R2 ризик.
**Resolver:** redesign-v2-planner (next session — прочитати PR #2908 diff).
**Deadline-proxy:** before Phase 2 closeout (Wave 2 unblock).

**RESOLVED 2026-05-18 (PR #2908 diff read):** PR #2908 виконав **два migration paths паралельно**:

- **Path A (Finyk/Routine/Nutrition):** Drop `<ModuleShell>` entirely, render `<ModuleAccentProvider module="X">` (без `asShellRoot`) → `<MeshBackground>` → header + content + nav. Inline coментар у `FinykApp.tsx:253-260` пояснює: «ModuleAccentProvider drops `asShellRoot` because MeshBackground takes the shell role».
- **Path B (Fizruk):** Залишився на `<ModuleShell module="fizruk">` (`FizrukApp.tsx:121`). Сам `ModuleShell.tsx:62-78` (per PR-6 diff) тепер internally wraps content у `<MeshBackground style={shellStyle}>` — comment: «module shell wraps content in `<MeshBackground>` so the mesh-gradient surface renders behind every module screen».

**Висновок:** Fizruk **DOES** отримує MeshBackground — через ModuleShell wrap. Функціонально еквівалентно іншим трьом модулям. D2 «real gap» framing був неточний. Це **architectural inconsistency** (3 modules direct, 1 via ModuleShell), не coverage gap. R2 (medium risk про chrome incoherence) знижено до **low**. Залишається open якщо хочеш delete'нути ModuleShell цілком — тоді Fizruk треба мігрувати на Path A. Інакше: leave as-is.

### Q2 — QuickActionsMenu vs quick-add: canonical interaction model

**Text:** Code-component `QuickActionsMenu` (radial long-press) vs mockup `quick-add/` (FAB→bottom-sheet) — це дві несумісні interaction models на одному surface. Треба вибрати одну.
**Blocks:** Phase 4 FAB work.
**Resolver:** user (product decision).
**Deadline-proxy:** before Phase 4 starts.

**RESOLVED 2026-05-18 (prototype side-by-side + 2nd-pass user challenge):** Це **не конкуренти** — різні рівні, обидва ship. `quick-add` = Hub-level entry-creation (cross-module new record). `QuickActionsMenu` = per-item context menu (edit/delete/duplicate existing record). Жести не перетинаються (single-tap FAB vs long-press item), області не перетинаються (FAB унизу vs row у середині). Decision: **wire обидва паралельно**, не послідовно.

- `quick-add` PLAN-state → Phase 4 (V1 wiring, 1 PR + sheet primitive).
- `QuickActionsMenu` per-item wire → новий слот у Phase 5 або 6 (4-5 PRs, по одному на модуль: Фінік transactions, Фізрук exercises, Харч meals, Рутина habits).
- AI-парсинг (REC-state quick-add) → post-launch, окреме рішення.

Прототип порівняння: `mockups/product/quick-add/comparison-vs-quick-actions.html` (2026-05-18).

### Q3 — Landing direction lock: v1 / v2 / v3?

**Text:** Який із трьох landing directions канонічний для launch? Заблоковано всі downstream marketing assets.
**Blocks:** marketing-web workstream commission, pricing page, OG cards consistency.
**Resolver:** user (strategic).
**Deadline-proxy:** 2026-05-25.

### Q4 — Marketing scope: integrate vs separate workstream

**Text:** Чи маркетинг/лендинг/прайсинг має увійти в redesign-v2 plan як Phase 8+, чи запускати окремий «marketing-web» workstream?
**Blocks:** Q3 owner призначення.
**Resolver:** user.
**Deadline-proxy:** 2026-05-25.

**RESOLVED 2026-05-18:** **Окремий workstream, пізніше.** Marketing-web не входить у redesign-v2 plan. Треба статтю-секцію у `redesign-v2/README.md` зі explicit exclusion + placeholder для майбутнього `docs/marketing-web/README.md`. Запуск marketing-web — після завершення Phase 2-3 продуктового redesign-v2.

### Q5 — Finyk A/B exit criteria

**Text:** PostHog flag `finyk.hero.single-storey` запущено per locked decision §3.1, але без success metric, evaluation window, decision owner. A/B йтиме indefinitely без exit condition.
**Blocks:** Phase 7 (deferred) promotion decision.
**Resolver:** redesign-v2-planner + analytics.
**Deadline-proxy:** before Phase 7 promotion (на сьогодні — quarter+).

### Q6 — 10 speculative tech-debt gaps triage

**Text:** `handoff-package/Hidden tech-debt audit.md` (2026-05-17) флагнув 10 speculative gaps (form controls on glass, Toast/Tooltip/Popover surface, Banner, WelcomeScreen, AuthPage, etc.) — потребують 5-min code-review кожен. Не верифіковано.
**Blocks:** Phase 3 friction work.
**Resolver:** redesign-v2-planner.
**Deadline-proxy:** before Phase 3 starts.

**RESOLVED 2026-05-18 (grep batch verify):**

| #   | Component                                         | Finding                                                                                     | Status                                                 |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 8   | `OfflineBanner.tsx:37,76,91` + `IOSInstallBanner` | `bg-panel/90 backdrop-blur-sm` — partial v2 (has blur, v1 color)                            | **Low priority** — works visually на mesh завдяки blur |
| 9   | `WelcomeScreen.tsx:145-266`                       | `bg-panel/60`, `bg-panelHi` — pure v1                                                       | **Phase 7 deferred** per execution-plan                |
| 10  | `AuthPage` / `LoginForm` / `RegisterForm`         | Out of scope, per plan                                                                      | **Phase 7 deferred**                                   |
| 11  | `Input.tsx:66-72`                                 | All 3 variants use `bg-panelHi` — real v1 gap on glass parents                              | **Phase 7 deferred** (Form controls audit)             |
| 12  | `Banner.tsx:20`                                   | `bg-panelHi/60` — v1 with transparency                                                      | **Low priority**                                       |
| 13  | `Toast.tsx`                                       | grep returned no `bg-panel` matches — uses different surface pattern або programmatic style | **No gap confirmed**                                   |
| 14a | `Tooltip.tsx:254`                                 | `bg-fg text-surface` — inverted colors (foreground bg)                                      | **No gap** — inversion works on any parent             |
| 14b | `Popover.tsx:242`                                 | `bg-panel border border-line rounded-2xl shadow-float` — real v1 chrome                     | **Medium priority** — appears on mesh hub              |

**Net result:** 4 already-deferred-to-Phase-7 (правильно), 2 low-priority partial v2 (OfflineBanner, Banner), 1 false alarm (Tooltip), 1 unconfirmed (Toast), 1 real medium gap (`Popover` — added to backlog).

### Q7 — KpiRow vs KpiRowCompact reconcile

**Text:** `execution-plan.md` згадує `KpiRowCompact`; `Hidden tech-debt audit` proposes `KpiRow`. Однакові чи дві granularities? Reconcile docs або визначити boundary.
**Blocks:** Phase 4 wiring.
**Resolver:** redesign-v2-planner.
**Deadline-proxy:** before Phase 4.

**RESOLVED 2026-05-18 (grep verified):** Не два components — один. `apps/web/src/shared/components/ui/KpiRowCompact.tsx` shipped у PR #2969 (Phase 2.0) як «P2 primitive». `KpiRow` (без `Compact`) — це **aspirational name** у `handoff-package/Hidden tech-debt audit.md:216` («KPI mini-grid... сьогодні inline в 4 модулях»). Tech-debt audit написаний **до** P2 primitives bundle shipping; `KpiRow` як «primitive proposal» був superseded шипленням `KpiRowCompact`. Treat names as aliases — `KpiRowCompact` є канонічна реалізація. Tech-debt audit doc оновлено clarification note. Phase 4 wiring використовує `KpiRowCompact` без амбівалентності.

### Q8 — 5 code orphans: wire or deprecate?

**Text:** `FeatureSpotlight`, `QuickActionsMenu`, `CelebrationModal`, `StreakProtection`, `InsightCard` — wire по плану або deprecate? Якщо wire — куди (which phase, which surface)?
**Blocks:** дей-код накопичення, потенційне дублювання.
**Resolver:** user + redesign-v2-planner.
**Deadline-proxy:** 2026-06-01.

**RESOLVED 2026-05-18 (grep-verified):** Не всі — orphans. Auditor R1 мав 2 помилки + я знайшов 6-й orphan:

| Component                                         | Grep result                                                                                                                                                          | Дія                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `FeatureSpotlight` + `SpotlightQueue`             | Pure orphan (own stories+test only)                                                                                                                                  | Wire (Phase 4 wow) ABO deprecate                                                                    |
| `QuickActionsMenu`                                | Pure orphan                                                                                                                                                          | **Wire у Phase 5/6** per-item у 4 модулях (per Q2 revised resolution) — не orphan після цього       |
| `CelebrationModal` (shared/)                      | **НЕ orphan** — `useCelebration()` used у `AuthPage.tsx:4` + `RegisterForm.tsx:8`. Плюс duplicate `core/onboarding/CelebrationModal.tsx` used у `HubDashboard.tsx:7` | Не orphan; **архітектурний defect — два файли з тим самим іменем, треба consolidate** (новий issue) |
| `StreakProtection`                                | Pure orphan                                                                                                                                                          | Deprecate — `StreakFlame.StreakBadge` (used у `dashboardCards.tsx:14`) покриває візуальну потребу   |
| `InsightCard`                                     | Pure orphan (infra `useInsightDismissal` є, UI Card не wired)                                                                                                        | Wire (Phase 5 — Insights wiring) — план уже планував це у Phase 5                                   |
| **+ `StreakCelebration`** (новий orphan, не у R1) | Pure orphan; коментар у `dashboardCards.tsx:156-177` каже «currently unused»                                                                                         | Deprecate                                                                                           |

**Net:** 3 deprecate-candidates (`SpotlightQueue+FeatureSpotlight` якщо не wire у P4, `StreakProtection`, `StreakCelebration`), 1 wire-у-P5 (`InsightCard`), 1 архітектурний consolidation (`CelebrationModal` дубль), Q2-dependent (`QuickActionsMenu`).

### Q9 — 6 mockup novel surfaces: backlog or accept-as-debt?

**Text:** `nudges`, `push`, `quick-add`, `states`, `responsive`, `details-pattern` — додати в `backlog.md` з phase-owner або прийняти як post-launch design-debt?
**Blocks:** design coherence; future agents re-implementing.
**Resolver:** redesign-v2-planner + user.
**Deadline-proxy:** 2026-06-01.

**RESOLVED 2026-05-18:** **Post-launch designation.** Виняток: `quick-add` стає Phase 4 surface (per Q2 resolution). Решта 5 (`nudges`, `push`, `states`, `responsive`, `details-pattern`) — записати у `backlog.md` зі статусом «post-launch design-ready, no v2 commitment», щоб мокапи мали явний owner-tag і future agents не дублювали.

### Q10 — Fizruk accent light/dark mode pair documentation

**Text:** `theme.css:278` light `--c-chart-fizruk: #155e75` + `:480` dark `#22d3ee` — це legitimate light/dark split, не bug. Але `mockup-reviewer R2` показує, що landing v2-bento-modular використовує `#22d3ee→#0e7490` як fizruk gradient, що ярче за light-mode chart var. Потребує доку як intentional pair.
**Blocks:** brand coherence at landing.
**Resolver:** mockup-reviewer + DS owner (next session).
**Deadline-proxy:** this week (тактично).

**RESOLVED 2026-05-18 (theme.css verified):** Inline comments у `apps/web/src/styles/theme.css` уже документують intent: line 278 `cyan-800 — 7.5:1 vs cream`, line 480 `cyan-400` (lighter for dark backgrounds), line 637 (HC light) знову `cyan-800`, line 677 (HC dark) `cyan-300` (ще lighter для high contrast). Це **систематичний contrast pivot pattern** для всіх module chart vars, не fizruk-specific. Додано додатковий блок-коментар на початку `--c-chart-*` секції що пояснює pivot rationale. Landing mockup `v2-bento-modular` використовує `#22d3ee` (cyan-400) як hero gradient stop — це match'ить **dark-mode** var, не light-mode. Якщо landing рендериться у light theme — це brand-coherence gap (cyan-400 brighter than cyan-800 chart). Не bug у theme.css, а design choice у mockup. Marketing-web workstream вирішить direction lock (Q3) — тоді можна align'ити landing з обраною theme.

### Q11 — flows/shared.css missing — verify

**Text:** `mockup-reviewer R1` зафіксував, що `mockups/flows/signup-flow.html`, `referral-flow.html`, `n8n-flow.html` referencують неіснуючий `flows/shared.css`. Тільки `telegram-bot.html` коректно імпортує `../_shared/tokens.css`. Verify, then fix or migrate imports.
**Blocks:** mockup-as-spec integrity.
**Resolver:** mockup-reviewer (1-line ls check + fix).
**Deadline-proxy:** P1 wave.

---

## Execution plan (sequencing only — acceptance criteria authored під час P1)

### P1 — Plan-doc corrections + tactical mockup fixes

**depends_on:** none
**blocks:** P2

**Tasks:**

- Update `execution-plan.md` Phase 4.1: «create primitives» → «wire existing primitives» (D1). Owner: planner-agent next session.
- Add Fizruk shell migration to plan (Phase 2 add-on or Phase 3 friction), pending Q1 resolution (D2). Owner: planner.
- Add acceptance-criteria template stub for Phases 3/5/6 (D9). Owner: planner.
- Add explicit marketing-scope exclusion статтю до `redesign-v2/README.md` ABO заплановати Q4 (D5). Owner: planner.
- Fix or create `mockups/flows/shared.css` (Q11). Owner: mockup-reviewer.
- Register `mockups/product/nudges/` у `mockups/index.html` portal. Owner: mockup-reviewer.
- Rename `mockups/product/fizruk/dashboard.html` title tag (R1 finding). Owner: mockup-reviewer.

**Exit criteria:** Один PR відкрито на план-корекції з усіма пунктами в diff. Один PR на mockup-tactical fixes.

### P2 — User decision elicitation

**depends_on:** P1
**blocks:** Q1, Q2, Q3, Q4, Q6, Q7, Q8, Q9

**Tasks:** Користувач відповідає на Q1–Q4, Q6–Q9 (Q5 — quarter horizon, Q10/Q11 — тактично в P1).

**Exit criteria:** 8 open questions resolved або scheduled з конкретним owner.

### P3 — Backlog hygiene + token alignment

**depends_on:** P2

**Tasks:**

- 6 mockup novel surfaces + 5 code orphans → `backlog.md` зі статусами (Q8, Q9) або deprecation PRs.
- `NutritionDashboard.tsx` + `DailyPlanMacros.tsx`: replace `chartHex` static import → `rgb(var(--c-chart-nutrition))` (D7).
- StrategyPage: design owner ABO explicit «out of v2 scope» документ (D10).
- Document Fizruk light/dark accent pair (Q10).

**Exit criteria:** `backlog.md` відображає всі 11 unowned items зі статусом. NutritionDashboard token migration PR merged.

### P4 — Marketing-web workstream commission

**depends_on:** Q3 resolved

**Tasks:**

- Lock landing direction (Q3 output).
- Create pricing page mockup (новий surface).
- Wire `useCelebration()` для signup post-submit wow (D8) — 1 PR.
- Resolve Q4 scope boundary документально.

**Exit criteria:** Pricing-page мокап committed. Signup wow PR drafted. Marketing scope decision documented in `redesign-v2/README.md` або окремий `marketing-web/README.md`.

---

## Risks

### R1 (high) — Wave 2 заблоковано + план стале → duplicate work

**Description:** Routine V1 + Nutrition V2 чекають merge PR #2969. Якщо новий агент читає `execution-plan.md` cold, бачить Phase 4.1 «create primitives» і починає їх re-creating, дублюючи PR #2969.
**Mitigation:** Update plan ASAP (P1 D1). Merge PR #2969.
**Trigger:** PR #2969 не змерджено до 2026-05-25 OR будь-який новий PR пропонує `HeroValueLine`/`CounterReveal`.

### R2 (med) — Fizruk shell ambiguity → ModuleBottomNav v2 в legacy chrome

**Description:** PR #2971 (ModuleBottomNav v2) приземляється у Fizruk. Якщо Fizruk на legacy `ModuleShell` без `MeshBackground` wrap, v2 nav рендериться в v1 chrome — visual incoherence.
**Mitigation:** Resolve Q1 ДО merge #2971; document as known issue if shipped first.
**Trigger:** dogfooding screenshot показує fizruk nav без mesh background.

### R3 (med) — No landing direction → marketing assets stalled

**Description:** Усі OG cards / social posts / pricing copy потребують direction lock. Кожен день затримки — день pre-launch timeline.
**Mitigation:** Lock direction цього тижня (Q3).
**Trigger:** будь-який marketing PR відкривається без direction-aligned token referencing.

### R4 (low) — 11 unowned surfaces accumulate як design-debt

**Description:** 5 code orphans + 6 mockup novel. Future agent might re-implement `QuickActionsMenu` як `quick-add` sheet, не знаючи, що orphan уже є — або деплоїти `CelebrationModal` без дизайн-перевірки.
**Mitigation:** Triage Q8+Q9 within 2 weeks.
**Trigger:** будь-який PR пропонує duplicate quick-add component OR celebration UI без cross-ref.

---

## Requires human

- **Q2, Q3, Q4, Q8, Q9** — потребують user product/strategic decisions, council не може execute.
- Q5 (Finyk A/B exit) — потребує analytics ownership, поза design council scope.

## Memory candidates

- `project_redesign-v2-alignment-2026-05-18.md` | type: project | content: «v2 plan stale (P4.1 primitives shipped P2.0); Fizruk only module not on MeshBackground; 11 unowned surfaces (6 mockup-novel + 5 code-orphan); marketing scope absent from plan; landing direction unlocked. Council audit doc: `docs/design/redesign-v2/alignment-audit-2026-05-18.md`».
- `feedback_three-artifact-alignment-pattern.md` | type: feedback | content: «При porівнянні code↔план↔мокапи — найцінніша знахідка bucket C: surfaces у двох артефактах, відсутні в третьому. Why: ці точки виявляють implicit assumptions. How to apply: завжди скоупити trilateral audit з окремими агентами на кожен артефакт, не один на всіх трьох».
