# Sergeant v2 — Полірувальний backlog (PR-8 follow-ups)

> **Last validated:** 2026-05-18 by council-v4 (alignment audit additions). **Next review:** 2026-08-13.
> **Status:** Active

## Контекст

Sergeant v2 редизайн (governance: `redesign-v2.md`) поставив **foundation** через 9 PR (PR-0..PR-8). Це backlog **підстраничного полірування** яке доставило б 100% візуального паритету з handoff мокапами, але було свідомо відкладено зі скоп v2 rollout щоб не блокувати landing.

Кожен пункт нижче — окремий micro-PR (~30 хв роботи). Можна виконувати в будь-якому порядку: вони незалежні.

## Audit-2026-05-18 additions

Знайдено council-v4 alignment audit ([`alignment-audit-2026-05-18.md`](./alignment-audit-2026-05-18.md)).

### Critical (block Wave 2 / chrome incoherence)

- [x] ~~Fizruk shell migration~~ **(Q1 resolved 2026-05-18 — not a gap)**. PR #2908 diff read показав, що `ModuleShell.tsx` сам internally wraps content у `<MeshBackground>` (line 62-78). Fizruk через ModuleShell отримує mesh background. Функціонально еквівалентно іншим трьом модулям (які використовують direct `<MeshBackground>` через Path A migration). Залишилася **architectural inconsistency low-priority** — 3 modules direct vs 1 via ModuleShell — але це не coverage gap і не blocking. R2 ризик знято до **low**. Якщо хочеш delete `ModuleShell` цілком — тоді треба мігрувати Fizruk на Path A; інакше leave as-is. Деталі: [`alignment-audit-2026-05-18.md`](./alignment-audit-2026-05-18.md) §Q1 resolved.

- [ ] **NutritionDashboard `chartHex` → CSS var migration** (D7). `apps/web/src/modules/nutrition/components/NutritionDashboard.tsx:6` + `DailyPlanMacros.tsx:5` імпортують `chartHex` static hex з `@sergeant/design-tokens/tokens`. Замінити на `rgb(var(--c-chart-nutrition))` для HC/dark parity. **Розмір:** XS.

- [x] ~~flows/shared.css broken imports fix~~ **(Q11 resolved у PR #2991 — 2026-05-18)**. 3 flow mockups мігровані до `../_shared/tokens.css`.

### Q6 speculative gaps verified (2026-05-18)

- [ ] **`Popover.tsx:242` v1 chrome** (Q6 #14b verified). `bg-panel border border-line rounded-2xl shadow-float` — real v1 surface, рендериться над v2 mesh hub. Migrate до `bg-surface-glass backdrop-blur-md`. **Розмір:** XS-S.

Inші speculative items з `handoff-package/Hidden tech-debt audit.md` verified як: 4 Phase 7 deferred (WelcomeScreen, AuthPage, Input/Form controls), 2 low-priority (OfflineBanner has blur — works visually; Banner has transparency), 1 false alarm (Tooltip uses inverted colors `bg-fg text-surface` — works on any parent), 1 unconfirmed (Toast — grep no hits). Деталі: audit doc §Q6.

### Acceptance criteria template (D9)

Phases 3, 5, 6 у `execution-plan.md` мають zero acceptance criteria. Якщо беретесь за task з цих фаз — спочатку додайте acceptance criteria у форматі:

- **F-task (Phase 3 Friction):** step-count before/after | undo-availability TTL | user-visible confirm state
- **P-task / V-task / W-task (Phase 4):** primitive existing? | wiring file path | motion budget compliance (Hard Rule #17)
- **Phase 5 (Insights):** trigger ID | value-framed copy text | activation rate target (per insight)
- **Phase 6 (Expensa delights):** visual reference (mockup or screenshot) | wiring file path | A/B flag? (PostHog)

Без acceptance criteria — task не actionable і має бути reject'нутий під час PR review.

### Post-launch design-ready (mockup exists, no v2 commitment)

5 поверхонь з production-fidelity мокапами у `mockups/product/` без phase-owner у v2 plan. Reject'нуто як wave 2 scope. Wire після v2 close coordinated cycle. **Не дублювати** — якщо беретесь за один з цих surfaces, спочатку прочитайте відповідний `mockups/product/<name>/index.html`.

- [ ] **`mockups/product/nudges/`** — anti-nag cross-module toast system з fatigue-pip counter. Найбільш elaborated novel surface. Refs: `docs/design/cross-module-prompts.md`.
- [ ] **`mockups/product/push/`** — push notification lock-screen templates (streak reminder / AI nudge / paywall re-engagement / weekly digest). Refs: `docs/launch/tech/telegram-improvements-roadmap.md`.
- [ ] **`mockups/product/states/`** — empty/error/zero-data system, 5 surfaces (4 modules + hub). Refs: `docs/design/empty-states.md`.
- [ ] **`mockups/product/responsive.html`** — tablet/desktop hub layout (sidebar nav + bento grid). Жодна phase не торкається tablet/desktop breakpoints.
- [ ] **`mockups/product/details-pattern.html`** — deep-screen nav pattern (transaction detail, workout detail, meal detail). Absent з module mockups.

### Surface decisions

- [ ] **`quick-add` (Hub FAB → bottom-sheet)** — moved до Phase 4 (Q2 resolution, audit 2026-05-18). Prototype comparison: [`mockups/product/quick-add/comparison-vs-quick-actions.html`](../../../mockups/product/quick-add/comparison-vs-quick-actions.html). PLAN-state mockup (2 тапи: модуль → режим) — implementation target. AI-парсинг (REC-state) — post-launch.
- [ ] **`QuickActionsMenu` per-item wiring (Phase 5/6)** (Q2 resolution). Code існує у `apps/web/src/shared/components/ui/QuickActionsMenu.tsx` (0 consumers). Wire у per-item long-press для 4 модулів: Фінік transactions, Фізрук exercises, Харч meals, Рутина habits. 4-5 PRs (по 1 на модуль). **Розмір:** S × 4-5.
- [ ] **`InsightCard` wire у Phase 5** (Q8 resolution). Code існує у `apps/web/src/shared/components/ui/InsightCard.tsx` (0 consumers поза index.ts). Wire у `HubInsightsBlock` per Phase 5 insight triggers. **Розмір:** S.
- [ ] **`CelebrationModal` dual-file consolidate** (Q8 resolution). `apps/web/src/shared/components/ui/CelebrationModal.tsx` (used у AuthPage + RegisterForm via `useCelebration()`) + `apps/web/src/core/onboarding/CelebrationModal.tsx` (used у HubDashboard) — два файли з тим самим іменем. Звести до одного (вирішити який canonical), оновити imports. **Розмір:** S. **Risk:** import-path renames можуть зачепити stories.
- [ ] **Deprecate-кандидати** (Q8 resolution): `FeatureSpotlight` + `SpotlightQueue`, `StreakProtection`, `StreakCelebration` — exported у `shared/components/ui/index.ts`, 0 consumers поза own stories/tests. `StreakFlame.StreakBadge` (used у `dashboardCards.tsx:14`) покриває streak-visualization потребу — `StreakProtection` + `StreakCelebration` redundant. Якщо немає планів wire — видалити та зняти з `index.ts`. **Розмір:** XS на кожен.

## Hidden tech-debt gaps (audit 2026-05-17 — handoff-package)

> Знайдено канвою + grep по `apps/web/src/` 2026-05-17. Повний контекст — [`handoff-package/Hidden tech-debt audit.md`](./handoff-package/Hidden%20tech-debt%20audit.md). Спеціально не входило в оригінальний `redesign-v2/execution-plan.md`.

- [ ] **ModuleBottomNav v2 unification** (PR-8 у локед послідовності) — `apps/web/src/shared/components/ui/ModuleBottomNav.tsx` + 4 module wires (`finykNav.tsx`, `fizrukNav.tsx`, `RoutineBottomNav.tsx`, `NutritionBottomNav.tsx`). **Decision locked 2026-05-17: full v2 (НЕ chrome-lift).** Мігрувати до `mx-3 mb-3 rounded-r-2xl shadow-nav bg-surface-strong-glass` (як `HubBottomNav` після PR-5). Active pill: `bg-{module}-strong` (НЕ `ink-strong`) — module identity несе pill background замість icon glow. **Routine спец-кейс:** center FAB як sibling (`z-index >`, `top: -22` above pill), НЕ nested у nav; nav стає 2-tab pill, FAB виступає над bezel. Оновити [`unified-bottom-nav.md`](../unified-bottom-nav.md) — формула «однакова форма» застаріла після PR-5. **Розмір:** M.
- [ ] **AssistantAdviceCard + TodayFocusCard glass migration** — `apps/web/src/core/insights/AssistantAdviceCard.tsx:59`, `TodayFocusCard.tsx:183`. `bg-panel border border-line rounded-2xl shadow-card` → `<Card prominence="glass" radius="r-lg">`. Hub-level surfaces juxtapose'ують з v2 InsightCard/AIPill/WeeklyDigest. **Розмір:** S.
- [ ] **`core/hub/dashboard/dashboardCards.tsx` glass migration** — extension до C1 (`BentoCard`). Bundle з C1 у Phase 2.1. **Розмір:** S.
- [ ] **CrossModulePreview v1 chrome** — `apps/web/src/core/hub/CrossModulePreview.tsx:77`. Згадано в Phase 2.4 (Onboarding cards), але без verification recipe. Mapping `prominence="glass" radius="r-lg"`. **Розмір:** XS.
- [ ] **Skeleton glass-aware tint** — `apps/web/src/shared/components/ui/Skeleton.tsx` primitive має знати про parent surface. На glass card v1 `bg-panelHi` shimmer виглядає як footprint. Додати `variant?: 'default' | 'glass'` (default = current, glass = `bg-white/10` shimmer). Bundle у Phase 0. **Розмір:** S (1 primitive + propagation).
- [ ] **PullToRefresh stories v1 wraps** — `apps/web/src/shared/components/ui/PullToRefresh.stories.tsx:55,81,108`. Wrap demo `bg-panel rounded-2xl border border-line` → glass. Storybook only. **Розмір:** XS.
- [ ] **6.4 AI-source tag на tx/meal rows** (cherry-pick з handoff Phase 6 extension) — `<Badge size="xs" soft module="finyk">AI · Кав'ярні</Badge>` на auto-categorized Finyk tx-rows; `<Badge>AI · фото</Badge>` на photo-imported Nutrition meals. Pattern primitive — той самий `Badge soft module=` recipe (existing). Wiring-only. **Розмір:** XS-S.
- [ ] **W6 StreakFlame wiring (Routine hero)** (cherry-pick з handoff Phase 4 extension) — Coral radial-glow у правому верхньому куті Routine hero card + streak day counter. Motion-safe (Hard Rule #17 — займає AMBIENT slot замість mesh усередині hero). Hook: `useStreakFlame(streakDays)` повертає `{intensity, shouldAnimate}`. Primitive existing — потрібен hook + integration. **Розмір:** XS.

### Speculative gaps (verify first)

Потребують 5-min code-review для підтвердження. Повний перелік у [`handoff-package/Hidden tech-debt audit.md`](./handoff-package/Hidden%20tech-debt%20audit.md) §🤔.

- IOSInstallBanner / OfflineBanner surface на v2 mesh
- Form controls (`Input`, `Select`, `Switch`, `Slider`) на glass-card parents (Input `bg-panelHi` background "пливе" на glass)
- Banner / Toast / Tooltip / Popover surface treatment на v2
- Onboarding cards (`ReEngagementCard`, `FirstActionSheet`, `DailyNudge`) — partial у Phase 2.4

### Out of scope для v2 (deferred to Phase 7 v2.1)

- WelcomeScreen first-time experience
- AuthPage / LoginForm / RegisterForm (login screen)
- PaywallModal / TrialBanner (окремий "Premium v2" цикл)
- HubChat (full-screen route) modal-route restructure (L)

## Hub

- [ ] **HubMainContent dashboard cards** — 4 module quick-open tiles + widgets мігрують `<Card>` → `prominence="glass"`, `radius="r-lg"`. Перевір що hero gradient усе ще видно через glass.
- [ ] **HubHeader greeting row** — застосувати `text-style-headline` для greeting; перевірити що Manrope weight-800 рендериться.
- [ ] **HubReports (Звіти)** — `Card prominence="glass"` для period selector + chart cards. Bar chart re-tint per module: `bg-chart-finyk` (emerald-700), `bg-chart-fizruk` (cyan-800), `bg-chart-routine` (coral-700), `bg-chart-nutrition` (lime-800).
- [ ] **HubProfile** — avatar tile у `prominence="hero" module=null`, 3 stats grid у glass tinted cards.
- [ ] **HubSettings** — section cards у glass; module-tinted icons зліва (як handoff Part 1 #05).
- [ ] **HubBottomNav active ring** — оптично перевірити, що `bg-ink-strong` pill добре читається в усіх 4-х tabs (Головна, Звіти, Профіль, Налаштування). Якщо текст активного tab не видно — підняти `text-bg-base` contrast або тимчасово відкатати тип.

## Finyk

- [ ] **Overview hero balance card** — `prominence="hero" module="finyk" radius="r-2xl"` із `bg-hero-emerald` як decorative ring (CSS gradient на ring-2 layer). Big balance number у `text-style-display` Manrope weight-800.
- [ ] **Transactions list** — кожен `<TxRow>` у `prominence="glass" radius="r-lg"`. Search/filter chips у `bg-surface-soft-glass`.
- [ ] **Budgets hero** — місячний бюджет hero як hero card; кожна лімітна категорія `prominence="tinted" module="finyk"` з progress bar у `bg-finyk` (cyan-700).
- [ ] **Analytics bar chart** — income bars `bg-chart-finyk`, expense bars `bg-chart-routine`. Top categories list з module-tinted glass cards.
- [ ] **Assets** — net worth hero + assets/liabilities glass cards.

## Fizruk

- [ ] **Overview stats grid** — 4 metric tiles у `prominence="glass" radius="r-xl"`. "Next workout" call-to-action — primary-ink button.
- [ ] **Workout active screen** — timer у large display ramp; sets list як `prominence="glass" radius="r-lg"` rows.
- [ ] **Journal** — weekly strip у glass pills; workout list rows як glass cards.
- [ ] **Progress** — PR cards з delta indicators (chart-fizruk colors); volume chart у glass surface.

## Routine

- [ ] **Today coral hero** — `prominence="hero" module="routine" radius="r-2xl"`. Week-strip у tinted glass pills. 5 habit checkboxes — animation when checked (existing `animate-check-pop`).
- [ ] **Habits management** — habit list rows у glass; archive list зі `bg-surface-soft-glass`.
- [ ] **Analytics heatmap** — 90-day grid в glass card; longest streak hero stat.
- [ ] **Goals** — active goals list як glass cards з progress bars (coral).

## Nutrition

- [ ] **Today calorie ring** — `<ProgressRing variant="nutrition">` усередині hero glass card. Macro bars у tinted glass row tiles.
- [ ] **Scanner viewfinder** — full-screen overlay не торкаємо (camera UX); але mode toggle (barcode/photo/voice) у `bg-surface-strong-glass` pill.
- [ ] **Journal** — weekly strip + meal list rows як glass cards.
- [ ] **Analytics** — 7-day bar chart з goal line; top foods list.

## Chat / FTUX / Sheets (handoff Part 3)

- [ ] **ChatSheet modal-route** — змінити `/chat` з full-screen route на bottom-sheet з `state.background` pattern. Зміни:
  - `router.tsx`: render chat route conditionally based on `location.state.background`
  - `apps/web/src/shared/components/feedback/ChatSheet.tsx` (новий) — bottom-sheet wrapper навколо existing `<HubChat>` view
  - AIPill уже navigate'ить `CHAT_PATH` — після cleanup це автоматично відкриватиметься як sheet
- [ ] **ManualExpenseSheet large-amount input** — amount input як головна метрика sheet'a (handoff #24), font `text-style-display` Manrope weight-800.
- [ ] **Scanner result sheet** — food scan card з macros + portion stepper у glass surface (handoff #25).
- [ ] **FTUX module picker** — 4-module multi-select tiles як `prominence="hero" module="<m>"` (handoff #27).

## Insights backlog (PR-7a hook scaffold; wire actual triggers тут)

- [ ] `finyk-coffee-limit-{YYYY-MM}` — Coffee spend > +25% MoM
- [ ] `finyk-budget-overrun-{cat}` — Категорія перевищена > 10%
- [ ] `finyk-recurring-detected` — Recurring tx без recurring rule
- [ ] `fizruk-rest-day-overdue` — 3+ днів підряд без тренування
- [ ] `fizruk-pr-pending` — Поточна вага > previous PR -5%
- [ ] `routine-streak-record-pending` — Найдовший streak -1 день
- [ ] `routine-todo-evening` — 2+ pending звички, час > 20:00
- [ ] `nutrition-protein-low` — Білку < 60% цілі, час > 18:00
- [ ] `nutrition-streak-7-days` — 7 днів в нормі калорій

## Bundle-size + cleanup

- [ ] **DM Sans retire decision** — після PR-8 measure `pnpm size-limit`. Якщо Manrope сам у бюджеті — видалити `@fontsource-variable/dm-sans` + `theme.css "DM Sans Fallback" @font-face` + Tailwind preset fallback entry.
- [ ] **Manrope subset** — current import завантажує ALL subsets (Latin + Latin-ext + Cyrillic + Cyrillic-ext + Greek + Vietnamese). UA-first product може скоротити до Latin + Latin-ext + Cyrillic + Cyrillic-ext — економія ~30kB woff2. Зробити явні `@import "@fontsource-variable/manrope/{latin,cyrillic}.css";` замість blanket import.
- [ ] **`@core/*` alias** — додати у tsconfig.json `paths` + vite.config.ts `resolve.alias` так що relative `../../../core/app/appPaths` не потрібен (наприклад, у AIPill.tsx).
- [ ] **v1 token deprecation** — після PR-8 додати JSDoc `@deprecated` на `--c-text` / `--c-bg` / `--c-line` (рекомендувати `--c-ink` / `--c-bg-base` / `--line-v2`).

## Verification (фінал)

Перед closure всього v2 rollout:

- `pnpm check` clean
- `pnpm size-limit` ≤ 900kB JS / 28kB CSS brotli
- Playwright snapshots × 5 top routes мають візуальний паритет з handoff `screens/Part-*.html`
- axe a11y scan усіх 4 modules + Hub clean
- HC mode перевірити окремо
- iOS Capacitor preview test (background-attachment fixed, safe-area-inset, mesh не глюкає)

## Refs

- `docs/design/redesign-v2/governance.md` — adapter strategy + governance
- Handoff: `D:\_unzipped\handoff\screens\` + `final/`
- PR-0..PR-8: див. `redesign-v2.md § PR sequence` для merged PR-URLs
