# Sergeant v2 redesign — canvas handoff

> **Last touched:** 2026-06-26 by @dimastahov16012003. **Next review:** 2026-09-24.
> **Status:** Reference

> **Призначення:** короткий бриф для Claude Code / агента що буде закривати наступні PR-и
> redesign-v2 polish. Споживається разом з канвою (4 HTML файли поруч).
> **Створено з канви:** 2026-05-17 на основі `../execution-plan.md`,
> `../backlog.md`, `../migration.md`, фактичного коду `apps/web/src/modules/{4}`.
> **Статус:** Reference (historical) — redesign-v2 (Phases 0–6) fully closed 2026-05-21.
> Цей бриф виконав свою місію (orchestration наступних PR-ів); тримається як історія.
> Фактичний результат — у [`../execution-status.md`](../execution-status.md).

---

## 1. Що змінити у плані

Знахідки з канви, яких **немає** у поточному `../backlog.md` / `execution-plan.md`. Додати
як нові polish items або підпункти.

### 1.1 ⚠ Прихована тех-дебт: `ModuleBottomNav` ще на v1

**Стан.** `HubBottomNav` мігровано на v2 floating glass pill у PR-5 (mx-3 mb-3, `bg-ink-strong`
active background pill, `shadow-nav`, `rounded-r-2xl`). `ModuleBottomNav` (Finyk / Fizruk /
Routine / Nutrition) — **лишається v1**: flat `bg-panel/95 backdrop-blur-xl border-t border-line`
з sliding top-pill 4px indicator + drop-shadow icon glow.

**Звідки знаю.** Прочитав:

- `apps/web/src/shared/components/ui/ModuleBottomNav.tsx` — current v1 implementation
- `apps/web/src/modules/finyk/components/finykNav.tsx` — 5 items
- `apps/web/src/modules/fizruk/shell/fizrukNav.tsx` — 4 items
- `apps/web/src/modules/routine/components/RoutineBottomNav.tsx` — 2 items + center FAB
- `apps/web/src/modules/nutrition/components/NutritionBottomNav.tsx` — 4 items

**Чому не в backlog'у.** `unified-bottom-nav.md` стверджує що Hub і Module nav мають
«однакову форму». Це було вірно ДО PR-5. Зараз форма Hub'а — v2 glass-pill,
форма Module — v1 flat panel. Документ застарів.

**Рекомендація — додати в `../backlog.md` § Hub секцію**:

```markdown
- [ ] **ModuleBottomNav v2 unification** — мігрувати spec ModuleBottomNav до того ж glass-pill
      shape що HubBottomNav (PR-5). **Decision locked 2026-05-17: full v2, не XS chrome-lift.** Адаптації:
  - Active pill — `bg-{module}-strong` (не brand-agnostic `ink-strong`), щоб зберегти
    module identity який сьогодні передається через icon glow
  - Routine: center FAB як sibling (zindex >, top: -22), не nested у nav. Геометрія
    nav залишається flat 2-tab всередині pill, FAB виступає над bezel
  - Update `unified-bottom-nav.md` після ландинга — поточний опис застарілий
  - Розмір: M (1 shared file + 4 module re-wires + Storybook + updated doc)
```

**Альтернатива (якщо M завеликий):** XS-міграція лише chrome: `border-t` → `shadow-nav` +
`mx-3 mb-3 rounded-r-2xl`. Зберегти existing top-pill indicator + icon glow. Виглядає більш
unified без зламу контракту.

### 1.2 Patterns у Phase 6.x — розширити scope

Phase 6 у `execution-plan.md` обмежений «Expensa-inspired delights» з 3-ма items для Finyk.
Канва показала, що ті самі patterns мають аналоги в інших модулях. Додати як **6.4–6.7**:

```markdown
- 6.4 **AI-source tag on tx/meal rows** (extends 6.3 inline-suggestion з ManualExpenseSheet на feed)
  - Finyk: `<Badge size="xs" soft module="finyk">AI · Кав'ярні</Badge>` на auto-categorized tx
  - Nutrition: `<Badge>AI · фото</Badge>` на photo-imported meal — джерело категоризації
  - Pattern primitive — той самий `Badge soft module=` recipe
- 6.5 **Outcome copy на partial-progress macros** (extends V2 — поточно лише zero-state)
  - Замість «Білки 42 / 90 г» — «Білки · 12 г до цілі»
  - Замість «Жири 48 / 65 г» — «Жири · 17 г запас»
  - Reuse `getGoalAwareDesc` із `FirstActionHeroCard` (вже існує)
- 6.6 **Quick-add inline chips на Nutrition hero** (pre-AddMealSheet shortcut)
  - Pantry-aware suggestions як `<Chip>` поряд із macro bars
  - Один tap = log meal з default-portion (skip AddMealSheet entirely)
  - Закриває частину F1 (5-step → 1-step для repeat meals)
- 6.7 **PR badge на Fizruk Dashboard hero** (preview of W2)
  - W2 у плані — це event-based celebration на save-last-set
  - Цей pattern — persistent chip на dashboard який caching останній great-PR
  - Mounted state — не одноразовий toast, а glance-able indicator
```

### 1.3 Wow primitives без wiring — заповнити gap

Execution plan §Wow gaps каже:

> Primitives (`CelebrationModal`, `AnimatedNumber`, `StreakFlame`, `useFizrukRestSound`) існують,
> але **wiring у модулях відсутній**.

`StreakFlame` згадано в context «Free AMBIENT slot на module pages → StreakFlame glow або subtle
module-accent halo на hero», але **конкретне місце wiring не вказано**. Додати:

```markdown
- W6 **StreakFlame wiring** — Routine hero card. Coral radial-glow в правому верхньому куті
  hero card + streak day counter. Motion-safe (Hard Rule #17 — займає AMBIENT slot замість mesh
  усередині hero card). Hook: `useStreakFlame(streakDays)` повертає `{intensity, shouldAnimate}`.
```

---

## 2. Phase 2 polish migration — explicit per-module list

Це **doable today** після Phase 0 token bundle. Кожна міграція — невеликий PR, можна паралелити.

### 2.1 Finyk Overview HeroCard (C3)

**File:** `apps/web/src/modules/finyk/pages/overview/HeroCard.tsx`

```diff
- <div className={cn(
-   "rounded-3xl bg-finyk/[.06] dark:bg-finyk-surface-dark/10",
-   "border border-finyk/[.14] dark:border-finyk-border-dark/20",
-   "border-l-4 shadow-card",
-   accentLeft,
- )}>
+ <Card prominence="hero" module="finyk" radius="r-2xl">
+   <div aria-hidden style={{ background: 'var(--hero-grad-finyk)', opacity: 0.07 /* decorative wash */ }} />
```

- Зберегти `computePulseStyle` логіку (статус ok/warning/danger)
- Прибрати raw classes `border-l-4`, `bg-finyk/[.06]`
- Big day-budget: `text-style-display-hero` (T1 token) Manrope 800
- Networth row top: `text-style-title`

### 2.2 Routine Calendar Hero (V1)

**File:** `apps/web/src/modules/routine/components/RoutineCalendarHero.tsx`

```diff
- <Card as="section" variant="routine" padding="lg">
-   <p className="text-xs font-bold tracking-widest uppercase">{rangeLabel}</p>
-   <p className="text-xs text-subtle mt-1">{headlineDate}</p>
-   <div className="mt-4 flex flex-col sm:flex-row items-center gap-4">
-     <DayProgressRing ... />
-     <div className="flex-1 grid grid-cols-2 gap-2 lg:grid-cols-4">
-       {/* 4 naked KPI tiles */}
-     </div>
-   </div>
- </Card>
+ <Card prominence="hero" module="routine" radius="r-2xl">
+   <HeroValueLine
+     narrative={`${headlineDate} · ${dayProgress.completed} з ${dayProgress.scheduled} звичок · Серія ${currentStreak} днів`}
+     metric={<CounterReveal value={dayProgress.completed} max={dayProgress.scheduled} entranceFrom={0} duration={800} />}
+     ring={<DayProgressRing {...dayProgress} onClick={onOpenDayReport} />}
+   />
+   <KpiRowCompact items={[{ label: 'Подій', value: filteredCount }, ...]} />
+ </Card>
```

- Прибрати ESLint disable `sergeant-design/no-eyebrow-drift` (стане непотрібним)
- 4 KPI стають дрібним 1-row caption-meta, а не великими tiles
- ⚠ **Залежить від P2 primitive** `<HeroValueLine>` — створити у Phase 4 spinner перед цим PR

### 2.3 Fizruk Dashboard hero (C4)

**File:** `apps/web/src/modules/fizruk/pages/Dashboard.tsx` (lines ~384)

```diff
- <section className="rounded-2xl bg-panel shadow-card p-4 ...">
+ <Card prominence="hero" module="fizruk" radius="r-2xl">
+   <div aria-hidden style={{ background: 'var(--hero-grad-fizruk)', opacity: 0.08 /* decorative wash */ }} />
```

- Workout-list rows нижче — мігрувати до `<Card prominence="glass" radius="r-lg">` грудового контейнера
- Stat tiles → `prominence="glass" radius="r-xl"` (per backlog Fizruk Overview stats grid)

### 2.4 Nutrition Today (V2 + calorie ring)

**File:** `apps/web/src/modules/nutrition/pages/NutritionDashboard.tsx`

```diff
- {/* 4 zero macro plates */}
+ <Card prominence="hero" module="nutrition" radius="r-2xl">
+   <ProgressRing variant="nutrition" value={kcalConsumed} max={kcalGoal} />
+   <MacroBarRow macros={[
+     { label: 'Білки', value: protein.consumed, max: protein.goal, accent: 'nutrition' },
+     { label: 'Жири', value: fat.consumed, max: fat.goal, accent: 'warning' },
+     { label: 'Вугл.', value: carbs.consumed, max: carbs.goal, accent: 'routine' },
+   ]} />
+ </Card>
```

- Якщо `!hasGoal` — показати outcome CTA copy замість тайлів (V2 fix)
- Якщо partial-progress — поряд із кожним macro: «X г до цілі» / «X г запас» (мій extension 6.5)

---

## 3. Locked decisions — ухвалено @Skords-01, 2026-05-17

Ці рішення **зафіксовано**, не передоговорюються. Реалізатор працює виходячи з них.

### 3.1 Finyk Overview hero — A/B через TweaksPanel ✅

**Дефолт у проді:** 2-storey hero (план). Networth top + day-budget bottom з Manrope 800.
**Behind TweaksPanel toggle:** single-storey day-budget primacy (mine).

Implementation:

- `TWEAK_DEFAULS` JSON у HeroCard з ключем `"heroLayout": "two-storey"`
- PostHog feature flag `finyk.hero.single-storey` керує дефолтом для cohort
- Telemetry: `hero_viewed` event з `layout` property для A/B aggregation

### 3.2 ModuleBottomNav — full v2 migration ✅

**Не chrome-lift.** Повна міграція до v2 floating glass pill shape, з module-tinted active pill.

Implementation:

- `apps/web/src/shared/components/ui/ModuleBottomNav.tsx` — shape матч HubBottomNav v2 (mx-3 mb-3 rounded-r-2xl shadow-nav bg-surface-strong-glass)
- Active pill: `bg-{module}-strong` (НЕ brand-agnostic ink-strong) — збереже module identity. Сьогодні цю identity несе icon glow; після міграції її несе pill background.
- 4 module wires (`finykNav.tsx`, `fizrukNav.tsx`, `RoutineBottomNav.tsx`, `NutritionBottomNav.tsx`)
- **Routine special-case:** center FAB як sibling (zindex >, top: -22 above pill), НЕ nested у nav. Nav стає 2-tab pill, FAB виступає над bezel.
- Update `docs/05-design/design/unified-bottom-nav.md` — переписати «однакову форму» секцію (форми тепер ідентичні з v2 shape, лише accent differs)
- Розмір: **M** (1 shared file + 4 module re-wires + Storybook + updated doc)

### 3.3 Мої доповнення — cherry-pick дешевих ✅

**Включити в Phase 6 (v2 close):**

- 6.4 **AI-source tag на tx/meal rows** — Badge primitive existing, no new component, just wiring (XS-S)
- W6 **StreakFlame wiring** на Routine hero — primitive existing, потрібен hook + integration (XS)

**Відкласти у Phase 7 «Polish v2.1»:**

- 6.5 outcome copy на partial-progress macros
- 6.6 quick-add pantry-aware chips на Nutrition
- 6.7 PR badge на Fizruk Dashboard
- Single-storey Finyk hero (буде A/B variant у TweaksPanel, але full migration — v2.1)

---

## 4. Послідовність PR-ів — locked

```
Phase 0 bundle (T1-T6, P1, P2 primitives + Skeleton glass-aware)   ← BLOCKER
  ↓
Phase 1 quick wins (M1-M8 mobile + 7 inline fixes)                 ← parallel after Phase 0
  ↓
Phase 2 polish migration (4 modules parallel):
  - 2.2.A: Finyk HeroCard rewrite (C3) + TweaksPanel hook for 3.1 A/B
  - 2.2.B: Routine CalendarHero rewrite (V1)
  - 2.2.C: Fizruk Dashboard hero (C4)
  - 2.2.D: Nutrition Dashboard hero (V2)
  ↓
ModuleBottomNav full v2 migration (per 3.2)                        ← НОВЕ planned PR (M)
  ↓
Phase 3 friction removal (F1-F6)
  ↓
Phase 4 wow integration (P1+P2 primitives wiring + W1-W5)
  ↓
Phase 5 insights wire (9 InsightCards, parallel by module)
  ↓
Phase 6 Expensa delights:
  - 6.1 CategoryIconPill на tx-rows (з backlog)
  - 6.2 ManualExpenseSheet large-amount input (з backlog)
  - 6.3 Inline AI suggestion у ManualExpenseSheet (з backlog)
  - 6.4 AI-source tag на tx/meal feed (NEW from canvas, cherry-pick)
  - W6 StreakFlame wiring на Routine hero (NEW from canvas, cherry-pick)
  ↓
v2 close — measure, retro
  ↓
Phase 7 Polish v2.1 (deferred):
  - 6.5 outcome copy на partial-progress macros
  - 6.6 quick-add pantry-aware chips на Nutrition hero
  - 6.7 PR badge на Fizruk Dashboard hero
  - Single-storey Finyk hero — promote from A/B toggle if data positive
  - AuthPage v2
  - PaywallModal v2 («Premium v2» окремий цикл)
  - HubChat modal-route restructure
```

---

## 5. Файли для візуального референсу

Канва доступна як 4 HTML файли + index. Кожен мобільний (390×844), light + dark, 3 стани side-by-side.

- `Index.html` — точка входу, legend, summary
- `Finyk Overview Mobile.html` — C3 + 6.1 + 6.3 extension
- `Routine Today.html` — V1 + F3 + W6 + 2-tab+FAB nav specifics
- `Fizruk Dashboard.html` — C4 + W2 preview pattern
- `Nutrition Today.html` — V2 + 6.5 + 6.6 patterns

Кожен файл має:

- 3 артборди в light row + 3 артборди в dark row
- Element-by-element diff table з citation на конкретні рядки в `backlog.md` / `execution-plan.md`
- Citation map окремо для 0→1 (plan) і 1→2 (mine)
- repo_diff з file paths
- «Куди далі» з PR estimates

---

## 6. Перед першим PR — checklist

- [x] @Skords-01 ухвалив 3.1 / 3.2 / 3.3 ✅ (2026-05-17)
- [ ] PR-1 (doc updates): оновити `../backlog.md` + `../execution-plan.md` +
      `unified-bottom-nav.md` (per 3.2 — застарілий опис)
- [ ] PR-2 (Phase 0 bundle): T1+T2+T3+T6+P1+P2 + Skeleton glass-aware variant
- [ ] PR-3 (Phase 1 quick wins): M1-M8 mobile fixes
- [ ] PR-4..7 (Phase 2 parallel): 4 module hero migrations
- [ ] PR-8 (ModuleBottomNav v2): full migration з special-case FAB для Routine
- [ ] PR-9 (Phase 3): friction removal F1-F6
- [ ] PR-10 (Phase 4): wow primitives wiring W1-W5
- [ ] PR-11 (Phase 5): insights wire
- [ ] PR-12 (Phase 6): Expensa delights 6.1-6.4 + W6 cherry-pick
- [ ] v2 close + retro
- [ ] Phase 7 v2.1 backlog створено з deferred items

---

## Refs

- `docs/05-design/design/redesign-v2/governance.md` — governance
- `docs/05-design/design/redesign-v2/execution-plan.md` — phases
- `docs/05-design/design/redesign-v2/backlog.md` — polish items
- `docs/05-design/design/redesign-v2/migration.md` — BEFORE/AFTER patterns
- `docs/05-design/design/unified-bottom-nav.md` — **потребує оновлення** (опис v2 для module nav)
- `docs/05-design/design/brandbook.md` — voice, palette
- Canvas: 4 HTML файли у цьому проєкті
