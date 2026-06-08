# Sergeant v2 — Execution Plan (post-foundation polish + UX layer)

> **Last validated:** 2026-05-18 by council-v4 (alignment audit corrections applied — D1 P4.1 staleness).
> **Next review:** 2026-08-14.
> **Status:** Ready to execute (Phase 0+1 ✅ shipped, Phase 2 Wave 1 shipped, Phase 2+ next).
> **Companion docs:** [`governance.md`](./governance.md) (governance) · [`execution-status.md`](./execution-status.md) (live progress) · [`execution-brief.md`](./execution-brief.md) (orchestration contract) · [`backlog.md`](./backlog.md) (raw polish items) · [`migration.md`](./migration.md) (BEFORE/AFTER patterns) · [`handoff-package/`](./handoff-package) (canvas mockups + locked decisions) · [`design-system.md`](../design-system.md) (canonical contract).

## How to use this document

Цей файл — **виконавчий план** для агента/розробника, який буде закривати polish + UX gaps Sergeant v2 редизайну. Він написаний так, щоб новий агент міг увійти cold і виконувати PR-послідовність без додаткового брифу.

**Перед першим PR з цього плану — обов'язково:**

1. Прочитай `AGENTS.md` (Hard Rules, особливо #11–#17), `docs/05-design/design/redesign-v2/governance.md` (governance), `docs/05-design/design/redesign-v2/migration.md` (BEFORE/AFTER tokens).
2. Підвантаж `.agents/skills/sergeant-start-here/SKILL.md` + один specialist skill для основної поверхні (web — `sergeant-web`; DS зміни — `sergeant-design-system`).
3. Виконуй PR-и в **порядку залежностей** (див. dependency tree нижче). Phase 0 розблоковує Phase 1+, Phase 0.1 (`text-style-display` weight) розблоковує всю wow-typography.

**Локальні команди:** дотримуйся local-execution policy з `CLAUDE.md`. Не запускай `pnpm test` / `pnpm check` локально без явного прохання — CI прогонить. `pnpm typecheck` після кожної зміни — ок.

## Context: чому існує цей doc

Foundation v2 змерджено через PR-0…PR-7b (mesh, glass, Manrope, Lucide icons, AIPill, InsightCard, MeshBackground, HubBottomNav floating glass). Дві ради (DS council + UX council) провели аудит у травні 2026 і знайшли:

- **Foundation повна, але opt-in migration лишила ~25 під-сторінок на v1** → продукт виглядає "мозаїчно".
- **4 структурні token gaps** блокують повний v2 паритет.
- **Wow density — sparse**: primitives (`CelebrationModal`, `AnimatedNumber`, `StreakFlame`, `useFizrukRestSound`) існують, але **wiring у модулях відсутній**.
- **Value framing проседає** на Routine/Nutrition entry pages (KPI без narrative).
- **Friction точкова, не системна**: Nutrition AddMealSheet = 5 кроків (vs Finyk ManualExpenseSheet ~3), set-delete без undo, completion-note default-visible.
- **Web mobile readiness — good with rough edges**: 8 регресій (3 з DS аудиту + 5 нових з UX). Touch ergonomics 85%.
- **Apps/mobile (RN) свідомо відстає** — не в скоупі цього плану. Окремий стратегічний цикл.

## Architectural synergies (4 multiplier fixes)

Чотири шапки нижче — це **одні зміни, що закривають декілька проблем одночасно**. Виконати їх раніше за окремі patches економить роботу.

| Synergy                                                                      | Що закриває                                                                                              | Effort |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ |
| `--bottom-nav-height: 60px` style prop на `<MeshBackground>` у `HubHomeView` | Sheet positioning на хабі + FAB clearance + Toast positioning + AIPill hardcode (`HubHomeView.tsx:160`)  | **XS** |
| `useToast()` lifted у `ActiveWorkoutPanel` (Fizruk)                          | Workout Win celebration + set-delete undo (один shared hook)                                             | **S**  |
| `min-h-touch-target` design token + CSS rule                                 | FAB action items + KeyboardAccessory chips + Fizruk exercise-type segmented                              | **S**  |
| `<HeroValueLine narrative metric={CounterReveal}>` primitive                 | Routine hero narrative + Nutrition hero + Finyk balance wow-reveal (single primitive serves wow + value) | **M**  |

## Token gaps (DS team must close — Phase 0)

| #   | Gap                                                                                                                                                             | Evidence                                                                                                                              | Fix                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `text-style-display` / `text-style-headline` мають `fontWeight: 700` (preset комент каже 800). Manrope-800 неможливий через token → wow-typography заблокована. | `packages/design-tokens/tailwind-preset.js` (corrected 2026-05-17 — preset живе у monorepo package, не `apps/web/tailwind-preset.js`) | Patch `text-style-display → 800` АБО додати `text-style-display-hero` (40px+, Manrope 800, leading-tight). Рекомендую **додати окремий `text-style-display-hero`** — не зачіпає existing consumer'ів. |
| T2  | `--c-chart-{module}` CSS vars відсутні. Tailwind utility є, але не доступне з inline `style` (Recharts SVG fill потребує CSS var).                              | `apps/web/src/styles/theme.css`                                                                                                       | Додати 4 змінні у `:root` що дзеркалять preset values. Light + dark + HC окремо.                                                                                                                      |
| T3  | `Sheet.tsx` не має `variant="glass"`. Всі майбутні sheets default на v1 `bg-panel`.                                                                             | `apps/web/src/shared/components/ui/Sheet.tsx`                                                                                         | Додати `variant: 'default' \| 'glass'` prop analog `Card prominence`. Glass = `bg-surface-glass backdrop-blur-md border-t border-surface-line shadow-nav rounded-t-r-2xl`.                            |
| T4  | `--gradient-*` (v1 pastel) + `--hero-grad-*` (v2 bright) обидва active без `@deprecated`. Новий код може взяти будь-який.                                       | `apps/web/src/styles/theme.css :root`                                                                                                 | JSDoc `@deprecated` коментар над v1 vars + custom ESLint rule `sergeant-design/no-v1-gradient`.                                                                                                       |
| T5  | `prefer-text-style` lint — severity `warn`, не `error`. Нові екрани можуть слати raw `text-4xl font-bold` без CI fail.                                          | ESLint config                                                                                                                         | Підняти до `error` для `apps/web/src/modules/**` (точкове, не глобальне).                                                                                                                             |
| T6  | `min-h-touch-target` token не існує. Components самостійно інлайнять `min-h-[44px]` непослідовно.                                                               | DS layer                                                                                                                              | Додати token + CSS rule `@media (pointer: coarse) [data-touch-target] { min-height: 44px }`.                                                                                                          |

## Polish gaps (UI migration — Phase 2)

### CRITICAL (primary surfaces, користувач бачить першим)

| #   | File                                                           | Issue                                                                                                                                                | Effort |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| C1  | `apps/web/src/core/hub/dashboard/BentoCard.tsx:119`            | `rounded-3xl border border-line shadow-card` — Hub 4-module tiles на v1. Mapping: `prominence="glass" radius="r-lg" + shadow-card-v2`.               | S      |
| C2  | `apps/web/src/core/hub/HubReports.tsx:264-268,355-356,554,559` | StatCard + InsightCard + period-selector на v1 solid panels. Period-selector — v1 primary button.                                                    | S      |
| C3  | `apps/web/src/modules/finyk/pages/overview/HeroCard.tsx:56-60` | `bg-finyk/[.06] border-l-4 shadow-card` (raw). Мапа: `Card prominence="hero" module="finyk" radius="r-2xl" + shadow-card-v2`. Зберегти `pulseStyle`. | M      |
| C4  | `apps/web/src/modules/fizruk/pages/Dashboard.tsx:384`          | Hero wrapper + workout-list rows на `bg-panel shadow-card`.                                                                                          | M      |
| C5  | `apps/web/src/core/hub/HubSettingsPage.tsx:296,309,334`        | Search+tabs мають v2 glass, але section cards нижче — v1 `bg-panel`. Візуальна мозаїка на одній сторінці.                                            | S      |

### MAJOR (groupwise codemod, ~однотипна заміна)

**Fizruk:** `Programs.tsx:81`, `Measurements.tsx:76`, `Progress.tsx:545`, `BodyAtlas.tsx:134`.
**Finyk:** `Analytics.tsx:82`, `BudgetsLimitsSection.tsx:71`, `BudgetsGoalsSection.tsx:52`, `AssetsBars.tsx:99,144`.
**Routine:** `RoutineCalendarPanel.tsx:473` day-cards. Today coral hero — створити з нуля (немає).
**Nutrition:** `LogCardAnalytics.tsx:43,74,86,116,144`, `DailyPlanCard.tsx:290,331`, `MealRow.tsx:64`.
**Cross-Hub:** `CrossModulePreview.tsx:77`, `WeeklyDigestCard.tsx:442`, `onboarding/ReEngagementCard.tsx:33`, `FirstActionSheet.tsx:215`, `DailyNudge.tsx:71`.

Codemod recipe для всіх вище: `bg-panel … rounded-2xl shadow-card` → `<Card prominence="glass" radius="r-lg" shadow=v2-default>`. Перевір що hero gradient (якщо є) видно через alpha 0.82 light / 0.06 dark.

## Wow gaps (motion wiring — Phase 4)

Primitives існують. Wire layer відсутній.

| #   | Where                                                  | Currently                               | Target                                                                                                                                       |
| --- | ------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | Finyk balance reveal (Overview mount)                  | Статичний рендер                        | `CounterReveal entranceFrom={0}` + Success-Pulse ring. **Slot під `HeroValueLine`** (narrative + metric разом).                              |
| W2  | Fizruk last-set save (`WorkoutJournalSection.tsx:259`) | `toast.success("Тренування збережено")` | `useCelebration().goalCompleted({theme: "fizruk"})`. **Optimistic side-effect, НЕ блокує save**. Тільки на save-last-set (milestone gating). |
| W3  | Finyk savings goal hit                                 | Не tracked                              | Confetti `type="goal"` + `CounterReveal` до цільової суми.                                                                                   |
| W4  | Nutrition daily-close (95–105% kcal)                   | Нічого                                  | `MiniSuccess` toast "Денну норму виконано" + theme="nutrition".                                                                              |
| W5  | Routine non-milestone check                            | Beztichi flip                           | Мікро-частки (2-3 крапки), НЕ confetti. Confetti — лише на milestone (7/30/100/365).                                                         |

### Motion budget reconciliation (Hard Rule #17: max 1 AMBIENT + 1 RESPONSE concurrent)

- `MeshBackground.bg-mesh` — наразі static (без keyframes), займає AMBIENT slot декоративно. Перевір чи `motion-safe:` обгортка коректно strip'ить на `prefers-reduced-motion`.
- `motion-safe:backdrop-blur-md/xl` — додати на HubBottomNav + ModuleBottomNav (зараз blur активний завжди, не respect-ить reduced-motion).
- Free AMBIENT slot на module pages → `StreakFlame` glow або subtle module-accent halo на hero.

### Нові primitives потрібні

| #   | Component                                               | Чому                                                                                                             |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| P1  | `<CounterReveal value entranceFrom={0} duration={800}>` | `AnimatedNumber` animates value changes, не "entrance from zero" на mount.                                       |
| P2  | `<HeroValueLine narrative metric>`                      | Конструкційний primitive що containerizes value narrative + metric reveal. Single component reused в 3+ модулях. |

## Value gaps (copy + IA — Phase 4)

| #   | Where                                             | Currently                                                  | Target                                                                                                                                                         |
| --- | ------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | `RoutineCalendarHero`                             | 4 naked KPIs "Подій 7 / Звичок 4 / Виконання 0% / Серія 0" | `<HeroValueLine narrative="Сьогодні · 0 з 4 звичок · Серія 0 днів" metric={CounterReveal} />`. KPIs стають деталями нижче.                                     |
| V2  | `NutritionDashboard` (no goals state)             | 4 zero plates                                              | `"Встанови ціль по калоріях — і кожен прийом їжі стане прогресом, а не просто числом."` + primary CTA "Встановити ціль →". Плитки приховати до першого запису. |
| V3  | `HubInsightsBlock` collapsed subtitle             | `"AI-порада · 3 інсайти"`                                  | Перший інсайт вербально: `"Витрати на каву ↑25% цього місяця"`. Smart-expansion: auto-expand IF `hasActionableInsight && !inFtuxSession && innerWidth >= 390`. |
| V4  | `ModuleEmptyState` finyk/fizruk/routine/nutrition | Feature framing ("Почни вести фінанси")                    | Outcome framing ("Куди йдуть твої гроші?"). Reuse `getGoalAwareDesc` from `FirstActionHeroCard`. Додати `goalContext?` prop.                                   |
| V5  | `HubReports` insight threshold `>= 2`             | "Збери більше даних для інсайтів" коли <2                  | Показувати навіть 1 інсайт. Поріг штучний.                                                                                                                     |

## Friction gaps (UX surgery — Phase 3)

| #   | Where                                                                         | Currently                                                                                                                                                                                                                            | Fix                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `apps/web/src/modules/nutrition/components/AddMealSheet.tsx`                  | 5 кроків для звичайного manual log                                                                                                                                                                                                   | Skip step "source" якщо `mealTemplates.length === 0` && no `initialMeal` && no `photoResult` — одразу `step="fill"`. Кнопка "Обрати джерело ↑" як вторинна.         |
| F2  | `apps/web/src/modules/fizruk/components/workouts/WorkoutItemCard.tsx:303`     | Set delete без undo.                                                                                                                                                                                                                 | `showUndoToast` зі snapshot `sets` array (pattern A з `undo-pattern.md`). Hook `useToast()` піднято на `ActiveWorkoutPanel` (shared з W2).                          |
| F3  | `apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx:573-597`    | Completion note `<Input>` default-visible після відмітки.                                                                                                                                                                            | Collapse за `+ Нотатка` link. State: `noteExpanded: Record<string, boolean>` у `RoutineCalendarPanel`.                                                              |
| F4  | `apps/web/src/modules/fizruk/components/workouts/WorkoutItemCard.tsx:211-243` | Native `<select>` для типу вправи (Силова/Час/Дист) → нативний mobile picker.                                                                                                                                                        | Pill-segmented control з `min-h-touch-target` (T6).                                                                                                                 |
| F5  | Emoji як UI-text у production                                                 | `apps/web/src/modules/finyk/components/ManualExpenseSheet.tsx` category labels "🍴 їжа"; `apps/web/src/core/lib/recommendationEngine.ts:195` `icon: "💪"`; `insightsEngine.ts:317` `emoji: "🥗"`; `HubReports.tsx:526,589` 🥗 у JSX. | Замінити на `IconName` typed field у data layer + `<Icon name="..."> ` у render. Це data-layer touch, не лише JSX.                                                  |
| F6  | `apps/web/src/modules/nutrition/components/meal-sheet/MacrosEditor.tsx:42-64` | Unlink confirm-panel блокує kcal edit при linked food.                                                                                                                                                                               | Якщо `pickedFood && pickedGrams` — не показувати confirm при `kcal` edit; confirm лише для protein/fat/carbs. **Priority MEDIUM** (нові юзери не доходять до flow). |

## Web mobile gaps (responsive — Phase 1)

| #   | Where                                                                | Issue                                                                                                                                                                            | Fix                                                                                                                                                   |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `apps/web/src/styles/theme.css:844`                                  | iOS Capacitor mesh fallback через `@supports (-webkit-overflow-scrolling: touch)` застарілий (iOS 13+ не виставляє цю властивість). Mesh stutter на сучасних iPhone у Capacitor. | JS runtime detect: `window.Capacitor?.getPlatform?.() === 'ios'` → `bg-attachment: scroll`.                                                           |
| M2  | `apps/web/src/core/app/HubBottomNav.tsx:261-268`                     | `mb-3` на `<nav>` поверх safe-area-pb → pill упирається в home indicator на iPhone з notch.                                                                                      | Прибрати `mb-3` з `<nav>`, перенести в wrapper як `padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))`.                                 |
| M3  | Glass surfaces глобально                                             | `backdrop-blur-md` Android Chrome WebView jank.                                                                                                                                  | `motion-safe:backdrop-blur-md` (вже в W motion budget).                                                                                               |
| M4  | `apps/web/src/shared/components/ui/FloatingActionButton.tsx:195-199` | FAB на хабі перекривається 76px HubBottomNav pill. `--bottom-nav-height` not registered на hub shell.                                                                            | **Synergy fix**: `<MeshBackground style={{ "--bottom-nav-height": "60px" }}>` у `HubHomeView.tsx`. Розв'язує і Sheet positioning і Toast positioning. |
| M5  | `apps/web/src/shared/components/ui/KeyboardAccessory.tsx:97-104`     | Chips ~24px (px-2.5 py-1).                                                                                                                                                       | `px-3 py-2.5 min-h-touch-target` (T6 token).                                                                                                          |
| M6  | `apps/web/src/shared/components/ui/Sheet.tsx:131`                    | `var(--bottom-nav-height, 0px)` = 0 на хабі → sheet може перекриватись bottom nav.                                                                                               | Закрито M4 (single shared-root fix).                                                                                                                  |
| M7  | FAB action items + KeyboardAccessory chips                           | Touch targets ~36px та ~24px.                                                                                                                                                    | T6 token (`min-h-touch-target`).                                                                                                                      |
| M8  | Landscape iPhone keyboard                                            | Не всі sheets отримують `kbInsetPx` prop через `useVisualKeyboardInset`.                                                                                                         | Audit: ManualExpenseSheet, AddMealSheet, AddExerciseSheet, QuickStartSheet, HubChat — переконатися що передають `kbInsetPx`.                          |

## PR sequence

### Phase 0 — Foundation (DS team, blocking)

**Bundle 1 PR**, ~6-8 файлів, additive (нічого існуючого не ламає).

- T1 `text-style-display-hero` token (40px+, Manrope 800)
- T2 `--c-chart-{module}` CSS vars
- T3 `Sheet` `variant="glass"` prop
- T4 `@deprecated` на v1 gradient vars + `no-v1-gradient` lint
- T5 `prefer-text-style` → error для `modules/**`
- T6 `min-h-touch-target` token

**Verification:** `pnpm typecheck`. Існуючий код незмінний.

### Phase 1 — Quick wins (1 PR)

**Bundle ~10 файлів**, maximum visual uplift, minimum risk.

- 1.1 Wire `variant="v2-{module}"` на 4 FAB-ах (4 module entries)
- 1.2 M4 synergy: `--bottom-nav-height` style prop на `MeshBackground` у `HubHomeView`
- 1.3 M1 iOS Capacitor JS-detect
- 1.4 M2 HubBottomNav safe-area math fix
- 1.5 M5 KeyboardAccessory chip `min-h-touch-target`
- 1.6 M3 `motion-safe:backdrop-blur-md/xl` на nav
- 1.7 inline close-SVG → `<Icon name="close">` у Sheet + Modal

### Phase 2 — Polish migration (4-5 PR)

- **2.1 Hub CRITICAL**: C1+C2+C5 (BentoCard + HubReports + HubSettings tile body) + extension `dashboardCards.tsx` + Storybook stories cleanup (`PullToRefresh.stories.tsx` v1 wraps + `AssistantAdviceCard` + `TodayFocusCard`, per 2026-05-17 audit) — ~6 файлів
- **2.2 Module Hero**: C3+C4 + Routine V1 + Nutrition V2 (4 паралельних sub-PR — locked у [`handoff-package/Handoff for Claude Code.md`](./handoff-package/Handoff%20for%20Claude%20Code.md) §2). Finyk Overview hero — 2-storey default + single-storey behind PostHog flag `finyk.hero.single-storey` через TweaksPanel A/B (locked decision 2026-05-17).
- **2.3 Module lists codemod**: усі MAJOR з Polish gaps section — ~15 файлів
- **2.4 Onboarding cards**: CrossModulePreview + WeeklyDigest + ReEngagement + FirstAction + DailyNudge — ~6 файлів
- **2.5 ModuleBottomNav v2 full migration** (NEW PR, locked 2026-05-17) — shared `ModuleBottomNav.tsx` + 4 module wires (`finykNav` / `fizrukNav` / `RoutineBottomNav` / `NutritionBottomNav`) + Storybook + оновити [`unified-bottom-nav.md`](../unified-bottom-nav.md) (застаріле твердження про «однакову форму»). **Routine special-case:** center FAB як sibling, не nested. **Не chrome-lift** — full v2 glass-pill shape з module-tinted active pill (`bg-{module}-strong`). Розмір M.

### Phase 3 — Friction removal (5 PR, паралельно можна)

- 3.1 F1 — Nutrition AddMealSheet skip step
- 3.2 F2+W2 **bundled** — Fizruk WorkoutItemCard set delete undo + Workout Win celebration (shared `useToast()` hoist у `ActiveWorkoutPanel`). Celebration **optimistic, не блокує save**, тільки на save-last-set.
- 3.3 F3 — Routine completion note collapse
- 3.4 F4 — Fizruk exercise type pill-segmented
- 3.5 F5 — Emoji eradication (data layer touch: `recommendationEngine`, `insightsEngine`, ManualExpenseSheet category labels → `IconName`)
- 3.6 F6 — MacrosEditor unlink (MEDIUM priority, окремо)

### Phase 4 — Value + Wow integration (2-3 PR)

> **⚠️ Plan correction 2026-05-18 (alignment audit D1):** P1+P2 primitives (`CounterReveal`, `HeroValueLine`, `KpiRowCompact`, `MacroBarRow`, `ProgressRing variant`) **вже shipped** у PR #2969 (Phase 2.0 prework). Якщо читаєш cold — НЕ створюй їх повторно. Phase 4 — це **wiring-only** робота. Деталі: [`alignment-audit-2026-05-18.md`](./alignment-audit-2026-05-18.md) §D1.

- 4.1 ~~P1+P2 primitives: `<CounterReveal>` + `<HeroValueLine>`~~ **Done у PR #2969.** Skip — переходь до 4.2.
- 4.2 V4 `ModuleEmptyState` accepts `goalContext` prop, reuses `getGoalAwareDesc`. Copy rewrites для 4 модулів.
- 4.3 V1+V2 wire `HeroValueLine` у Routine + Nutrition + Finyk balance (one component, 3 usages) — **wire-only, primitive existing**
- 4.4 W1+W3+W4 wire `CounterReveal` + celebrations + MiniSuccess toasts
- 4.5 V3 HubInsightsBlock value-bearing subtitle + smart-expansion logic
- 4.6 V5 HubReports insight threshold fix

### Phase 5 — Insights wiring (паралельно Phase 4)

9 InsightCard тригерів з [`redesign-v2-backlog.md § Insights backlog`](./backlog.md) з value-framed copy (не "Кави +25%" а "Кави +25% — це 340 грн. Встановити ліміт?").

### Phase 6 — Expensa-inspired delights (після core polish)

- 6.1 Category-tinted icon pill на Finyk transaction rows
- 6.2 ManualExpenseSheet big amount hero (`text-style-display-hero` від T1 + JetBrains Mono)
- 6.3 Inline AI suggestion у ManualExpenseSheet: `<Badge variant="soft-module" dismissible animate>` recipe (NOT новий primitive — `Badge` + animation покриває)
- 6.4 **AI-source tag на tx/meal rows** (cherry-pick з 2026-05-17 handoff) — `<Badge soft module>AI · {category}</Badge>` на auto-categorized Finyk tx-rows + photo-imported Nutrition meals. Extension `Badge` recipe із 6.3, wiring-only. **Розмір:** XS-S.
- 6.5 **W6 StreakFlame wiring (Routine hero)** (cherry-pick з 2026-05-17 handoff) — Coral radial-glow + streak counter у правому верхньому куті Routine hero. Motion-safe AMBIENT slot. Primitive existing, потрібен `useStreakFlame(streakDays)` hook + integration. **Розмір:** XS.

### Phase 7 — Polish v2.1 (deferred bucket, post-v2-close)

Свідомо відкладено за межі v2 close (locked 2026-05-17). Окремий cycle після retro v2. Зокрема:

- **6.5b** Outcome copy на partial-progress macros (Nutrition) — замість «Білки 42 / 90 г» → «Білки · 12 г до цілі»; «Жири 48 / 65 г» → «Жири · 17 г запас». Reuse `getGoalAwareDesc` з `FirstActionHeroCard`.
- **6.6** Quick-add inline chips на Nutrition hero (pantry-aware) — pre-AddMealSheet shortcut. Один tap = log meal з default-portion. Закриває частину F1.
- **6.7** PR badge на Fizruk Dashboard hero — persistent caching-індикатор останнього great-PR (preview W2 pattern, mounted не одноразовий toast).
- **Finyk single-storey hero promotion** — promote з A/B variant у TweaksPanel до default якщо PostHog data positive.
- **AuthPage v2** — login/register screen migration (low-traffic але touchpoint).
- **PaywallModal v2** — окремий "Premium v2" цикл.
- **HubChat modal-route restructure** (L) — `/chat` з full-screen route → bottom-sheet з `state.background` pattern.
- **Form controls glass audit** — `Input` / `Select` / `Switch` / `Slider` на glass-card parents (Input `bg-panelHi` "пливе" на glass).
- **WelcomeScreen first-time experience** — v1 → v2.

### Phase 8 — Mobile RN parity (out of scope)

Свідомо відкладено. Окремий стратегічний цикл коли продукт ready.

## Dependency tree

```
Phase 0 ── розблоковує всі наступні
    ├── T1 (text-style-display-hero) ── Phase 4.4 (W2 Workout Win typography) + Phase 6.2 (Expensa amount hero)
    ├── T2 (chart vars) ── Phase 2.1 (HubReports chart re-tint)
    ├── T3 (Sheet glass) ── Phase 6.3 inline suggestion + future ChatSheet modal-route
    ├── T6 (min-h-touch-target) ── Phase 1.5 + Phase 3.4 + Phase 1 (Synergy 3)

Phase 1 ── independent після Phase 0, ship asap

Phase 2 ── independent від Phase 3/4. Може ship'итися in parallel.

Phase 3 ── 3.2 (F2+W2) залежить від Phase 0 (T1 для Workout Win typography optional)

Phase 4 ── P1+P2 primitives блокують 4.3+. 4.5 (HubInsightsBlock smart-expansion) можна окремо.

Phase 5 ── паралельно Phase 4 після 4.5 wiring

Phase 6 ── Phase 0 (T1, T3) + Phase 2 завершено
```

## Verification recipe (per PR)

1. **Local typecheck** (швидко, ловить регресії): `pnpm typecheck` або `pnpm --filter @sergeant/web typecheck`.
2. **Skills lint якщо SKILL.md змінено**: `pnpm lint:skills && pnpm skills:lock` (CI падає без оновленого lock).
3. **НЕ запускай локально** (CI прогонить): `pnpm test`, `pnpm lint`, `pnpm check`, `pnpm build`. Виняток — якщо користувач явно попросить pre-PR validation.
4. **Storybook оновлення**: якщо торкаєш `@shared/components/ui` — спочатку онови `*.stories.tsx`, тоді бампай freshness у `design-system.md` (як описано в `docs/05-design/design/README.md`).
5. **Перед звітом про виконання**: якщо НЕ запустив тести/лінт — скажи прямо ("typecheck зелений, тести не ганяв — CI перевірить на push").

## Hard rules — повтор для виконавця

- **#11** No arbitrary hex у `className`. Завжди semantic tokens (`bg-ink-strong`, не `bg-em-900`).
- **#12** Module-accent containment. `--module-accent-rgb` тільки всередині `ModuleAccentProvider`. `MeshBackground` НЕ публікує його зовні.
- **#13** No raw light/dark className pairs. `bg-surface-glass` (auto-flips), не `bg-white dark:bg-stone-800`.
- **#14** `focus-visible:`, не `focus:`. AIPill + InsightCard — еталон.
- **#16** 12px text floor. Якщо handoff пропонує 10px caption → mapping до `text-style-caption` (12px).
- **#17** Animation budget — max 1 AMBIENT + 1 RESPONSE concurrent. Mesh займає AMBIENT — будь обережний з другим декоративним ambient.

## Open questions для виконавця

- **T1 strategy**: новий `text-style-display-hero` (additive) чи patch existing `text-style-display` weight (зачіпає ramp consumer'ів)? **Рекомендація: additive.**
- **F5 emoji → IconName scope**: тільки production rendering чи теж data seeds/fixtures? **Рекомендація: production + data-layer (recommendationEngine, insightsEngine), seed fixtures лишити як є для backward-compat.**
- **W2 celebration gating**: тільки save-last-set чи теж great-PR (5%+ over previous)? **Рекомендація: save-last-set по замовчуванню, PR-detection — Phase 5+.**
- **V3 smart-expansion threshold**: `innerWidth >= 390` достатньо чи треба теж user-preference toggle? **Рекомендація: тільки viewport-based для MVP, додати preference у Settings якщо feedback з'явиться.**

## Refs

- Aудит контексту: `docs/05-design/design/redesign-v2/governance.md` § PR sequence, § Risks, § Open questions
- Backlog (raw items): `docs/05-design/design/redesign-v2/backlog.md`
- Migration patterns: `docs/05-design/design/redesign-v2/migration.md`
- DS canonical contract: `docs/05-design/design/design-system.md`
- Brand voice: `docs/05-design/design/brandbook.md` (потребує align з `redesign-v2.md` — див. T4)
- Empty state patterns: `docs/05-design/design/empty-states.md`
- Undo pattern doctrine: `docs/05-design/design/undo-pattern.md` (применить consistently — F2)
- Module accent rules: `docs/05-design/design/module-accent.md`
