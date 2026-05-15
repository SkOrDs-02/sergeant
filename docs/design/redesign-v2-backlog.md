# Sergeant v2 — Полірувальний backlog (PR-8 follow-ups)

> **Last validated:** 2026-05-15 by @Skords-01. **Next review:** 2026-08-13.
> **Status:** Active

## Контекст

Sergeant v2 редизайн (governance: `redesign-v2.md`) поставив **foundation** через 9 PR (PR-0..PR-8). Це backlog **підстраничного полірування** яке доставило б 100% візуального паритету з handoff мокапами, але було свідомо відкладено зі скоп v2 rollout щоб не блокувати landing.

Кожен пункт нижче — окремий micro-PR (~30 хв роботи). Можна виконувати в будь-якому порядку: вони незалежні.

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

- `docs/design/redesign-v2.md` — adapter strategy + governance
- Handoff: `D:\_unzipped\handoff\screens\` + `final/`
- PR-0..PR-8: див. `redesign-v2.md § PR sequence` для merged PR-URLs
