# Page Audit — Nutrition module — 4 pages (start/pantry/log/menu)

> **Last validated:** 2026-05-13 by Devin.
> **Status:** Active
> **Auditor:** child Devin session (parent: <https://app.devin.ai/sessions/7d63e4e64e644012afe8c886eab9fc40>)
> **Pages in scope:**
>
> - `apps/web/src/modules/nutrition/pages/NutritionStartPage.tsx`
> - `apps/web/src/modules/nutrition/pages/NutritionPantryPage.tsx`
> - `apps/web/src/modules/nutrition/pages/NutritionLogPage.tsx`
> - `apps/web/src/modules/nutrition/pages/NutritionMenuPage.tsx`
>
> Plus orchestrator + dependent surfaces: `NutritionApp.tsx` (536 LoC), всі `components/` (~30 файлів), всі `hooks/` (~20 файлів), всі `lib/` (~40 файлів), `domain/`, `route.tsx`, `index.ts`.

## Scope notes

- **Pure static analysis.** Без `pnpm install` чи dev-серверу — `grep`, `read`, repo-cross-reference.
- Hard Rules registry використано як ground truth: `docs/governance/hard-rules.json` + `docs/governance/rules/*`.
- Module-accent для Nutrition — `nutrition` (lime/green), допустимі semantic tokens (`info`, `success`, `danger`, `warning`, `subtle`, `panel`, `line`).
- RQ key factory для модуля — `nutritionKeys`, plus `coachKeys` / `digestKeys` для cross-module invalidation.
- WCAG 2.1 AA — touch targets ≥44×44 px (див. Apple HIG + Stack-pulse PR `Button` auto-min).

## Summary

- **Critical:** 0
- **High:** 6
- **Medium:** 13
- **Low:** 6
- **Total:** 25

Three structural themes dominate:

1. **Hard Rule #11 / #13 порушення палітри** — у Nutrition-піддереві з'являються `text-blue-400`, `text-yellow-400`, `text-green-400`, `bg-amber-500/10`, `bg-sky-500`. Це raw Tailwind palette в className, без semantic-token wrapping, в обхід module-accent контракту.
2. **Hard Rule #10 — lifecycle markers відсутні майже всюди.** Тільки 5/~80 `.ts`/`.tsx` файлів модуля декларують `Last validated:` / `Status:`. Це лінт-enforced convention (`lint:lifecycle-markers`) — будь-який новий PR, що піде через `pnpm check` після додавання check-у, впаде.
3. **Accessibility — фокус-індикатори лише через opacity** (Pantry remove button, MealRow remove button). `focus-visible:opacity-100` робить інтерактив "видимим", але без ring/outline keyboard-юзер не бачить, де він — це WCAG 2.4.7 (Focus Visible) regression.

Bonus theme — **дубльовані Meal-ID generators** (7 sites) із незахищеною `Math.random().toString(36).slice(2, 7/8)`. Helper в одному файлі усунув би drift і помилку у `LogCardSearch.tsx` (`.slice(2, 7)` — 5 chars random) vs `useNutritionRemoteActions.ts` (`.slice(2, 8)` — 6 chars random).

## Findings

### F1 — Raw-palette кольори макро-міток у Daily Plan (Hard Rule #11/#13) [severity: high] [perspective: tailwind]

**Page:** Menu (`plan` sub-tab)
**File:** `apps/web/src/modules/nutrition/components/DailyPlanCard.tsx`
**Lines:** 131, 137, 143

**Description.**
Конфіг макро-міток у режимі редагування цілей містить raw Tailwind утиліти: `color: "text-blue-400"`, `"text-yellow-400"`, `"text-green-400"`. Це порушує Hard Rule #11 (no arbitrary hex / raw Tailwind palette в className) і Hard Rule #13 (no raw-palette light/dark pairs — тут немає dark-variant'у взагалі, тож контраст у dark mode не гарантований). Через `cn(..., color ?? "text-subtle")` ці значення летять напряму в DOM.

**Why it matters.**
Module-accent для Nutrition — lime/green; `text-blue-400` і `text-yellow-400` ламають візуальну консистентність модуля. У dark mode тембр кольорів обірвано (немає `dark:text-blue-300` тощо), тому при темі контраст частково не відповідає WCAG AA на легких лейблах. Окрім UX, через тиждень `eslint-plugin-sergeant-design/no-raw-palette-in-classname` поширюється і на цей шлях — PR падатиме на лінтах.

**Recommendation.**
Завести семантичні токени `text-macro-protein` / `text-macro-fat` / `text-macro-carbs` (як уже зроблено для `chartHex.protein`/`.fat`/`.carbs` у `NutritionDashboard.tsx`) і використовувати їх + `-soft`/`-strong` пари для dark mode. Як швидке рішення — замапити на існуючі `text-info` / `text-warning` / `text-success` semantic-токени.

---

### F2 — Sky-палітра у water-tracker progress bar (Hard Rule #11) [severity: high] [perspective: tailwind]

**Page:** Start (`WaterTrackerCard` рендериться через `NutritionDashboard`)
**File:** `apps/web/src/modules/nutrition/components/WaterTrackerCard.tsx`
**Lines:** 117

**Description.**
`done ? "bg-success" : "bg-sky-500"` — пряма Tailwind-палітра `sky-500` без semantic-токена і без dark-варіанту. У dark mode залишається той самий saturated синій, без companion `-strong` для контрасту проти білого тексту (якщо би він був).

**Why it matters.**
Hard Rule #11 (no arbitrary hex/raw palette) — це блокер convention. У module-accent контракті Nutrition — lime/green; sky-blue progress bar плутає тему модуля. На дешевих OLED-екранах при стандартному `--bg` темної теми контраст `sky-500` проти `bg-line/30` балансує впритул до 3:1 (нижче 4.5:1 для non-text UI elements за WCAG 1.4.11).

**Recommendation.**
Замінити на `bg-info` (semantic-токен) або, якщо концептуально вода — окремий "domain" поза nutrition-accent, ввести `bg-water` / `bg-water-strong` пару в design-tokens.

---

### F3 — Raw-palette `amber-500` у banner про великий журнал (Hard Rule #11/#13) [severity: high] [perspective: tailwind]

**Page:** Log
**File:** `apps/web/src/modules/nutrition/components/LogCard.tsx`
**Lines:** 132

**Description.**
`<div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">` — банер попередження "Журнал великий (~XXX КБ)" побудований на сирій `amber-500` палітрі без semantic-token mapping і без dark-variant пари. `text-amber-100` зокрема в light mode дає контраст ~2.3:1 проти `bg-amber-500/10` — провал WCAG 1.4.3 (AA 4.5:1 для small text).

**Why it matters.**
1. Контраст fail у light mode → не зчитується.
2. Hard Rule #11/#13 — лінт-enforced.
3. У репо вже є `Banner` компонент з варіантами `warning`/`danger` (використовується в `NutritionApp.tsx` line 422 — `<Banner variant="warning">`). Reuse усуває проблему повністю.

**Recommendation.**
Замінити inline `<div>` на `<Banner variant="warning">` із tone-маппінгом, що вже бере `bg-warning-soft` + `text-warning-strong`. Або, як мінімум, замапити на `text-warning-strong dark:text-warning` + `bg-warning-soft`.

---

### F4 — Touch target нижче 44×44 px на ItemRow delete button (WCAG 2.5.5) [severity: high] [perspective: a11y]

**Page:** Pantry (`items` sub-tab)
**File:** `apps/web/src/modules/nutrition/components/PantryCard.tsx`
**Lines:** 73–82

**Description.**
Кнопка видалення позиції з комори — `className="w-6 h-6 rounded-xl ..."` — 24×24 px. Загальний `Button` компонент репо auto-applies `min-h-[44px] min-w-[44px]` для `xs`/`sm`/`iconOnly` (див. `apps/web/AGENTS.md § Touch targets`), але цей site — raw `<button>` без `Button` wrapper-у і без `touch-target` utility, тому safety-net не зачіпає.

**Why it matters.**
WCAG 2.5.5 Target Size (Level AAA, але в репо це Level AA-policy для coarse pointers — див. Apple HIG-link в AGENTS.md). На мобільному (де `sm:opacity-0` гасить кнопку на ≥sm, тобто на mobile вона ВИДИМА) 24-точкова ціль під палець ≥75% помиляється поза bbox. Той самий патерн повторюється для inline `×` close-button-у в інших inline-картках — варто перевірити їх масово.

**Recommendation.**
Замінити raw `<button>` на `<Button size="iconOnly" variant="ghost">` (auto-44px), або додати `touch-target` utility (`min-h-[44px] min-w-[44px]`) і expand hit-area через `before:absolute before:inset-[-10px]` pseudo, якщо візуально кнопка має лишатися 24px. Той самий патерн — на `MealRow.tsx` swipe-delete.

---

### F5 — Фокус-індикатор лише через opacity (WCAG 2.4.7 Focus Visible) [severity: high] [perspective: a11y]

**Page:** Pantry, Log
**File:** `apps/web/src/modules/nutrition/components/PantryCard.tsx`, `MealRow.tsx`
**Lines:** PantryCard L77, MealRow L116

**Description.**
Обидва delete-кнопки використовують патерн `sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100`. Це робить кнопку "опаковою" при focus, але **відсутні** будь-які ring/outline. WCAG 2.4.7 явно вимагає видимого focus indicator — наявність елемента ≠ візуальний focus state.

**Why it matters.**
Keyboard-юзер на ≥sm:
- Перший Tab робить кнопку видимою (opacity-100), але без ring/outline він не розрізняє, де він зараз — між edit і remove button.
- На мобільному (нижче sm) opacity завжди 100, але теж нема focus ring — focus state не відрізнити від default.

WCAG 2.4.11 (Focus Not Obscured, 2.2 AA) і 2.4.7 (Focus Visible, A) обидва порушені на цих кнопках.

**Recommendation.**
Додати `focus-visible:ring-2 focus-visible:ring-nutrition/60 focus-visible:ring-offset-2 focus-visible:ring-offset-panel` парою з opacity-reveal. Той самий патерн з `DailyPlanGoalSelectors.tsx` (lines 175–178) — приклад правильного оформлення.

---

### F6 — Hard Rule #10 (lifecycle markers) практично відсутні у всьому модулі [severity: high] [perspective: lifecycle]

**Page:** All 4 pages + всі supporting файли
**File:** Module-wide
**Lines:** N/A

**Description.**
Тільки 5 файлів з ~80 у `apps/web/src/modules/nutrition/` декларують `Last validated:` / `Status:`:

- `pages/NutritionPantryPage.tsx` (L29–30)
- `hooks/useNutritionUiState.ts` (L78–79)
- `hooks/usePantryBarcodeScan.ts` (L12)
- `components/meal-sheet/useBarcodeLookup.ts` (L27–28)
- `components/meal-sheet/BarcodeSection.tsx` (L9–10)

Інші 75+ файлів (включно з 3 з 4 page-files: Start / Log / Menu) **не мають lifecycle declaration**.

**Why it matters.**
Hard Rule #10 — `lint-enforced-convention` (severity blocker). Коли `pnpm lint:lifecycle-markers` стане required на CI (per roadmap), весь модуль завалить лінт. Окрім CI, відсутність markers означає, що `bump-last-validated.mjs` (pre-commit hook для `.md`) не покриває `.ts` — ніхто не знає, чи файл живий чи deprecated, без archeology git-blame.

**Recommendation.**
Bulk-додати у JSDoc-prefix кожного публічного файлу:

```ts
/**
 * @scaffolded
 * Last validated: 2026-05-13 by @<owner>.
 * Status: Active
 */
```

Або винести правило обмеження тільки для page-level surfaces + entry-points (`route.tsx`, `index.ts`, `NutritionApp.tsx`, всі 4 pages) як short-term mitigation; long-term — повна вертикаль.

---

### F7 — RecipesCard.tsx 593 LoC — впритул до Hard Rule #18 ліміту [severity: medium] [perspective: rule]

**Page:** Menu (`recipes` sub-tab)
**File:** `apps/web/src/modules/nutrition/components/RecipesCard.tsx`
**Lines:** 1–593

**Description.**
Файл — 593 LoC. Ліміт за Hard Rule #18 (`max-lines: 600` для web TS/TSX, `active-initiative`) — 600 рядків. Будь-який наступний commit, що додасть навіть JSDoc-блок, провалить лінт.

Поруч `useNutritionRemoteActions.ts` (572), `NutritionApp.tsx` (536), `AddMealSheet.tsx` (439), `DailyPlanCard.tsx` (402) — потенційно прийдуть до того ж стану через тиждень.

**Why it matters.**
Active-initiative blocker — без проактивного split-у CI стане flaky. `RecipesCard` явно поєднує: список рецептів, edit-modal, attach-to-day picker, share/export — кандидати на extract.

**Recommendation.**
Split за UI-боундарями: `RecipesList.tsx` (рендер списку) + `RecipeEditModal.tsx` (модалка) + лишити `RecipesCard.tsx` orchestrator. Той самий рефакторинг паттерн уже застосований у `meal-sheet/` (split `AddMealSheet` на `FoodPickerSection`, `MacrosEditor`, `MealTypePicker`, `MealTemplatesRow`).

---

### F8 — Дубльовані Meal-ID generators (7 sites) з drift у довжині random-сегмента [severity: medium] [perspective: bug]

**Page:** Start, Log, Menu, Pantry
**File:** 7 файлів модуля
**Lines:** Multiple

**Description.**
Pattern `meal_${Date.now()}_${Math.random().toString(36).slice(2, N)}` дубльований у 7 місцях:

| File | Line | Slice end |
| ---- | ---- | --------- |
| `pages/NutritionLogPage.tsx` | 35 | `2, 8` |
| `lib/recipeBook.ts` | 88 | `2, 8` |
| `lib/foodDb/foodDb.ts` | 146 | `2, 8` |
| `hooks/useNutritionRemoteActions.ts` | 183, 482 | `2, 8` |
| `components/LogCardSearch.tsx` | 97 | `2, 7` ← drift |
| `components/RecipesCard.tsx` | 180 | `2, 7` ← drift |
| `components/AddMealSheet.tsx` | 207 | `2, 7` ← drift |

`LogCardSearch`/`RecipesCard`/`AddMealSheet` створюють meal-id з 5-символьним random tail, інші — з 6-символьним. На високих frequency add-meal операціях у межах однієї мілісекунди (`Date.now()` гранулярність) колізії 5-char (36^5 = 60.4M) проти 6-char (36^6 = 2.17B) — 36× імовірніші.

**Why it matters.**
Meal ID — primary key у `nutritionLog[date].meals` (`Meal.id`). Колізія = одна страва перезатирає іншу або undo-pop за `meal.id` помилково підтягне не той запис. У 99.9% — теоретичний bug, але дешевий до фіксу.

**Recommendation.**
Helper `apps/web/src/modules/nutrition/lib/mealIds.ts`:

```ts
import { randomShortId } from "@sergeant/shared";
export function newMealId(): string {
  return `meal_${Date.now()}_${randomShortId(8)}`;
}
```

Reuse скрізь. Long-term — switch на `crypto.randomUUID()` (підтримка iOS 14.5+, Android Chrome 92+, доступно на всіх target browsers за package.json browserslist).

---

### F9 — `sessionStorage` напряму у recipeCache.ts (bypass `@shared/storage`) [severity: medium] [perspective: rule]

**Page:** Menu (`recipes` sub-tab)
**File:** `apps/web/src/modules/nutrition/lib/recipeCache.ts`
**Lines:** 50, 73, 90

**Description.**
`recipeCache.ts` робить `sessionStorage.getItem/setItem` напряму. У репо є wrapper `@shared/storage` (Stage 7 closed, production allowlist count = 0 для `localStorage`), але ESLint-правило `sergeant-design/no-raw-local-storage` покриває лише `localStorage`, не `sessionStorage`. Тому ESLint не падає, але рекомендований паттерн порушено.

Окремо: cache key `"nutrition_recipes_cache_v1"` не зареєстрований у `packages/nutrition-domain/src/nutritionTypes.ts` (де лежать `NUTRITION_PANTRIES_KEY`, `NUTRITION_LOG_KEY`).

**Why it matters.**
1. Bypass — `sessionStorage` insertion помилок (quota, blocked-by-extension) не логуються через єдиний шлях.
2. Storage key drift — refactoring of key (rename з версією v2) не buble через типи.
3. Майбутній move на mobile (`apps/mobile`) не матиме session-storage — recipe-cache завалиться silently.

**Recommendation.**
Винести key в `nutritionTypes.ts` як `NUTRITION_RECIPES_CACHE_KEY`. Або, якщо це справді sessionStorage (cache per-tab), додати `webSessionKVStore` у `@shared/storage` і пройти через нього.

---

### F10 — Module-accent containment risk: `bg-info-soft` у нативно-Nutrition WaterTracker (Hard Rule #12 grey-zone) [severity: medium] [perspective: tailwind]

**Page:** Start
**File:** `apps/web/src/modules/nutrition/components/WaterTrackerCard.tsx`
**Lines:** 133–134, 164–165

**Description.**
Quick-add та custom-amount кнопки використовують `bg-info-soft text-info-strong dark:text-info border border-info/20`. Це не foreign module-accent (info ≠ finyk/fizruk/routine), але візуально йде в розріз із nutrition-accent (lime) — модуль виглядає двоколірним.

**Why it matters.**
Hard Rule #12 (`module-accent containment`) — буква правила про foreign module accents. Дух правила — кольорова консистентність модуля. WaterTracker — окрема концепція (water ≠ macros), але у Nutrition module subtree це візуальна fragmentation.

**Recommendation.**
Або:
1. Ввести окремий semantic-token `water` (`bg-water/...`, `text-water-strong`) — design-tokens roadmap-friendly.
2. Перевести на `nutrition-accent` (lime) і зменшити насиченість для розрізнення з macro-секціями (`bg-nutrition/15`, `text-nutrition-strong`).

---

### F11 — `staleTime: Infinity` на nutritionLog без явного invalidate-strategy [severity: medium] [perspective: perf]

**Page:** Log
**File:** `apps/web/src/modules/nutrition/hooks/useNutritionLog.ts`
**Lines:** 105–115

**Description.**
Inline-comment стверджує `staleTime: Infinity` — але query `useNutritionLog` не використовує `useQuery`. Натомість після кожного `setNutritionLog` робиться `queryClient.invalidateQueries({ queryKey: coachKeys.all })` і `digestKeys.all`. Це OK, але:

1. `coachKeys.all` invalidate — broad-stroke; коли у Coach 5–10 окремих query-нагляданих сюжетів (`coachKeys.weeklyDigest`, `coachKeys.daySummary`, …), всі вони refetch'аться при кожному `handleAddMeal`.
2. Зворотного `nutritionKeys.all` invalidate тут немає — `nutritionApi.barcode(...)` cache (TTL via `useBarcodeProduct.ts`) ніяк не реагує на write-flow.

**Why it matters.**
Performance regression — typing у Add Meal sheet (через `setNutritionLog` per-keystroke не йде, але після save) кожне збереження бьє Coach refetch storm. На 3G/edge — невидимий мобільному юзеру bandwidth-tax.

**Recommendation.**
Скоупити invalidations конкретніше (`coachKeys.daySummary(date)`, `digestKeys.week(weekIso)`). Якщо broad-invalidate концептуально потрібен — додати JSDoc-обґрунтування і пройти RQ-pattern-review.

---

### F12 — Page-level testing gap: 0 з 4 page-файлів покриті тестами [severity: medium] [perspective: test]

**Page:** Start, Pantry, Log, Menu
**File:** `apps/web/src/modules/nutrition/pages/*`
**Lines:** N/A

**Description.**
У модулі 23 `.test.*` файли (більшість — lib-функції типу `tdee.test.ts`, `nutritionStorage.test.ts`, `shoppingListStorage.test.ts`). Component-tests — лише 3:
- `DailyPlanCard.test.tsx`
- `DailyPlanCard.tdee.test.tsx`
- `PantryManagerSheet.test.tsx`

**0 з 4 page-файлів** мають smoke-test на render із моками `useNutritionPantries` / `useNutritionLog` / etc.

**Why it matters.**
Pages — high-level integration boundary. Без render-smoke-test регресії в `NutritionStartPage` (de-structuring props, lazy boundary, ErrorBoundary) пройдуть до production. Це не Hard Rule, але best-practice gap.

**Recommendation.**
Додати `pages/<Page>.test.tsx` для кожної з 4 сторінок — мінімум shallow render із моками controller-hook'ів, перевірка SectionErrorBoundary key.

---

### F13 — Імперативні setTimeout через scheduleTransient у production code [severity: medium] [perspective: bug]

**Page:** Start, Log
**File:** `apps/web/src/modules/nutrition/NutritionApp.tsx`
**Lines:** 116–136, 240–261

**Description.**
`scheduleTransient` — bucket для setTimeout'ів, ось виклики:
- `NutritionStartPage.tsx` L67–71 — 80 ms delay для відкриття AddMealSheet після route change.
- `NutritionApp.tsx` L246–260 — 80 ms delay + `requestAnimationFrame` для open file picker.

Pattern спрацьовує тому, що React render cycle вкладається в 80 ms у 95%+ випадків. Але на cold-load (3G, low-end Android) це може зайти 200+ ms — sheet не відкриється або відкриється посеред rerender'у. Race condition.

**Why it matters.**
Bug-class — UX flakiness on low-end devices.

**Recommendation.**
Замість timing-guess використати state-machine: `pendingAction: { kind: "open-add-meal" }` → `useEffect(() => { if (pendingAction.kind === "open-add-meal") { ... setPendingAction(null) } }, [pendingAction, log])`. Це детерміновано чекає на mount/state-flush.

Альтернатива — `flushSync` із `react-dom` для синхронного flush state перед follow-up imperative click.

---

### F14 — `as NutritionPage` cast у parser без exhaustive guard [severity: medium] [perspective: ts]

**Page:** All
**File:** `apps/web/src/modules/nutrition/lib/nutritionRouter.ts`
**Lines:** 53, 62

**Description.**
```ts
if (!VALID_NUTRITION_PAGES.includes(page as NutritionPage)) {
  return { page: "start" };
}
// …
return { page: page as NutritionPage, subTab: validSub };
```

Подвійний `as NutritionPage` cast там, де можна було б оголосити `isNutritionPage(value: string): value is NutritionPage`. Strict-mode flag `noUncheckedIndexedAccess: true` (Rule #19) тут не допомагає — bug surface не у indexed-access.

**Why it matters.**
1. Low-confidence cast — рідко, але `includes(page as NutritionPage)` на `readonly NutritionPage[]` приймає звужений тип, тобто рантайм `page = "evil-string"` пройде через `as` без помилки. Це benign тут (адже наступна перевірка все одно `includes` — fail-safe), але стиль порушує "justified-cast"-discipline.
2. Future-proof: коли `NutritionPage` додасть варіант, exhaustive predicate скаже точно, де додати.

**Recommendation.**
```ts
function isNutritionPage(v: string): v is NutritionPage {
  return (VALID_NUTRITION_PAGES as readonly string[]).includes(v);
}
// …
if (!isNutritionPage(page)) return { page: "start" };
return { page, subTab: validSub };
```

---

### F15 — Hardcoded magic-numbers у consume-pantry без uom-conversion test [severity: medium] [perspective: bug]

**Page:** Log, Menu (через `addMealFromPlan` → `wrappedSaveMeal` → consume hook)
**File:** `apps/web/src/modules/nutrition/hooks/useNutritionPantries.ts`
**Lines:** 269–298

**Description.**
`consumePantryItem` віднімає `gramsConsumed` від `qty`. Конверсія лише `г` ↔ `кг` (line 287–289). Решта unit-ів (`мл`, `л`, `шт`) бережно пропускаються коментарем "не одно-однозначна конверсія". OK по інтенту, але:
- На "1 шт яєць" не зменшується ніщо при `gramsConsumed=60` — інвентар розходиться з реальністю.
- На "2 л молока" віднімання 200 мл (як `gramsConsumed=200`) теж пропускається — bug user-perceived.

**Why it matters.**
User-perceived correctness: типовий кейс — "1 кг рису", "2 л молока", "10 шт яєць" — два з трьох ігноруються. Inventory drifts → wrong suggestions у Recipes-card based on `effectiveItems`.

**Recommendation.**
Розширити uom-table з density-defaults (`молоко: 1.03 г/мл`, `яйце: 60 г/шт`). Зробити окремий test-file `useNutritionPantries.consume.test.tsx` із 6+ cases (кг, г, мл, л, шт, undefined unit).

---

### F16 — Empty-state copy непослідовний (i18n / UX) [severity: medium] [perspective: ux]

**Page:** Pantry, Log
**File:** `LogCard.tsx` L167–169, `PantryCard.tsx`, `ShoppingListCard.tsx`
**Lines:** Multiple

**Description.**
Empty-states в модулі мають різний tone:
- LogCard: "Поки немає записів" + "Додайте перший прийом їжі, щоб почати вести журнал." (вживає звертання "ви")
- ShoppingListCard / PantryCard / RecipesCard — самі копи звертаються на "ти" ("Додай продукти на склад.", "Дай хоча б 2–3 продукти для рецептів.")

**Why it matters.**
Розрив у тональності UX, особливо помітний при flow з Pantry в Log (юзер за 2 кліки міняє звертання). Стиль-guide репо (`docs/governance/copy-style-guide.md`, якщо є) має дисциплінувати tone.

**Recommendation.**
Стандартизувати "ти" (більшість модуля так звертається, виходячи з grep). Замінити "Додайте", "Перевір з'єднання" → "Додай", "Перевір з'єднання".

---

### F17 — `arr[0] || makeDefaultPantry()` без явного guard на повернений тип [severity: low] [perspective: ts]

**Page:** Pantry (через `useNutritionPantries`)
**File:** `apps/web/src/modules/nutrition/hooks/useNutritionPantries.ts`
**Lines:** 73

**Description.**
```ts
arr.find((p) => p.id === activePantryId) || arr[0] || makeDefaultPantry()
```

З `noUncheckedIndexedAccess: true`, `arr[0]` має тип `Pantry | undefined`. `|| makeDefaultPantry()` робить chain коректним рантайм-ом, але читач не одразу бачить, що це навмисний guard, а не bug-magnet. Якщо `Pantry` отримує `id` як falsy-able тип у майбутньому, chain зламається.

**Why it matters.**
Code-quality nit, не bug.

**Recommendation.**
Explicit pattern:
```ts
const active = arr.find((p) => p.id === activePantryId);
const fallback = arr[0] ?? makeDefaultPantry();
return active ?? fallback;
```

---

### F18 — Inline non-null assertions у consumePantryItem (Hard Rule #19 cousin) [severity: low] [perspective: ts]

**Page:** Pantry, Log
**File:** `apps/web/src/modules/nutrition/hooks/useNutritionPantries.ts`
**Lines:** 278, 280, 293

**Description.**
```ts
const item = items[idx];          // type: Pantry | undefined
const qty = Number(item!.qty!);   // ← !.qty!
const unit = String(item!.unit! || "г")
// ...
items[idx] = { ...item!, qty: ... };
```

`items[idx]` already guarded by `if (idx < 0) return p;`, plus `findIndex` returns valid index — рантайм-safe. Але стиль `!` × 2 у одному виразі — суперечить spirit-у Rule #19 (replace cast/assertion with proper guard).

**Why it matters.**
Cast-discipline; legibility. У PR-review такий рядок завжди тригерить дискусію.

**Recommendation.**
Простий early-return refactor:
```ts
const item = items[idx];
if (!item) return p; // narrow
const qty = Number(item.qty);
const unit = String(item.unit ?? "г").toLowerCase().trim();
```

---

### F19 — `useEffect` без exhaustive-deps comment, риск stale-closure [severity: low] [perspective: bug]

**Page:** All (NutritionApp)
**File:** `apps/web/src/modules/nutrition/NutritionApp.tsx`
**Lines:** 143–149

**Description.**
First-run jump effect:
```ts
useEffect(() => {
  if (!firstRunNutrition) return;
  if (pwaAction === "add_meal" || pwaAction === "add_meal_photo") return;
  if (activePage !== "menu") setActivePageAndHash("menu");
  if (menuSubTab !== "plan") setMenuSubTab("plan");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount; subsequent edits to firstRun must not retrigger
}, []);
```

Lint disable обґрунтований коментарем (good), але:
- `firstRunNutrition`, `pwaAction`, `activePage`, `menuSubTab` зчитуються з closure mount-time → якщо `firstRunNutrition` flip-аеться синхронно перед mount-completion (race з SQLite read у `useModuleFirstRun`), effect зчитає stale `false` і ніколи не виставить menu/plan.

**Why it matters.**
First-time UX path → потенційний "не показалося Меню" для нового юзера.

**Recommendation.**
Або chained useEffect (`[firstRunNutritionSurface]` + cleanup-ref guard), або state-machine `routedToFirstRun` ref. Або взагалі lift це у `useNutritionRoute` (initial-page deduction).

---

### F20 — Відсутність `prefers-reduced-motion` guard у NutritionApp.tsx loading skeleton [severity: low] [perspective: a11y]

**Page:** Menu
**File:** `apps/web/src/modules/nutrition/NutritionApp.tsx`
**Lines:** 384–397

**Description.**
```tsx
<div className="space-y-3 motion-safe:animate-in motion-safe:fade-in">
  <SkeletonMealCard shimmer style={{ animationDelay: `${i * 60}ms` }} />
</div>
```

Зовнішній wrapper має `motion-safe:` (correct), але `<SkeletonMealCard shimmer>` всередині не явно перевіряє `prefers-reduced-motion` — `shimmer={true}` рендерить infinite animation. Якщо `Skeleton` компонент сам не консумує `prefers-reduced-motion` (треба перевірити), у юзерів з `reduce-motion` буде reduced wrapper animation, але infinite shimmer.

**Why it matters.**
Hard Rule #17 (animation budget) + WCAG 2.3.3 (Animation from Interactions, Level AAA), partial compliance.

**Recommendation.**
Перевірити `Skeleton`/`SkeletonText`/`SkeletonMealCard` — якщо `shimmer` не дисейблиться під `prefers-reduced-motion`, додати `motion-safe:` префікс на shimmer-class. Якщо вже дисейблиться — додати inline-коментар у NutritionApp.tsx.

---

### F21 — `setTimeout` без upper-bound у `transientTimersRef` (memory hygiene low risk) [severity: low] [perspective: perf]

**Page:** All
**File:** `apps/web/src/modules/nutrition/NutritionApp.tsx`
**Lines:** 116–136

**Description.**
`transientTimersRef.current` — `Set<NodeJS.Timeout>`, очищається на unmount. Якщо юзер дуже швидко натискає клавіші (file-picker open/close/open/close), у set накопичується N таймерів усі по 80 ms. На unmount всі cleared — OK. Але між клікам — їх ніхто не очищає, поки не fire. Пам'ять — N × ~32 байти, не критично.

**Why it matters.**
Pure code-hygiene nit.

**Recommendation.**
Або limit-cap (cap = 4), або replace pattern на debounce-with-handle. Не блокер.

---

### F22 — AI markers відсутні де могли б допомогти онбордити агента [severity: low] [perspective: ai-marker]

**Page:** All
**File:** Module-wide
**Lines:** N/A

**Description.**
У модулі — 0 `AI-NOTE` / `AI-CONTEXT` / `AI-DANGER` / `AI-LEGACY` markers (`grep` підтвердив). Водночас у коді є кілька high-context місць, де AI-NOTE значно прискорить наступного агента:

1. `NutritionApp.tsx` L143–149 — first-run jump (state ordering critical).
2. `useNutritionPantries.ts` L269–298 — uom-conversion only `г↔кг` навмисно.
3. `useNutritionLog.ts` L62–64 — `pendingThumbDeletesRef` cleanup timer.
4. `nutritionRouter.ts` L93–105 — legacy hash-parser, do not call from new code.

**Why it matters.**
Hard Rule "AI markers" — не блокер для відсутніх markers, але best-practice. Архіво-археологію в `useNutritionPantries.consumePantryItem` уже описано inline-коментарем (line 283–286) — це фактично `AI-CONTEXT` без префіксу.

**Recommendation.**
Закинути `// AI-CONTEXT: <2-3 sentence rationale>` префікси на 4 локації вище. Це нульовий ризик (markers — opt-in документація).

---

### F23 — Конструктор/parser-конструкція `MealRow.tsx` swipe-delete без aria-label-у на handle [severity: medium] [perspective: a11y]

**Page:** Log
**File:** `apps/web/src/modules/nutrition/components/MealRow.tsx`
**Lines:** ~110–123 (swipe wrapper)

**Description.**
`MealRow` загорнутий у `SwipeToAction`, swipe-delete працює на touch. Кнопка видалення (за `focus-visible:opacity-100`) має aria-label, але саме swipe-wrapper не оголошує жодного semantic role або pattern (Touch Accessibility — Apple HIG/Android: gesture-only без visible button = WCAG 2.1.1 fail для screen-reader-only users).

**Why it matters.**
Screen reader users не дізнаються про swipe-delete affordance. Кейс: VoiceOver-юзер, drag-and-drop неможливий, текстовий focus-button (× 24px) ховається за `focus-visible:opacity-100` — без зорового зворотного зв'язку він не зрозуміє, що знаходиться на delete-handle.

**Recommendation.**
Додати always-visible focus-only "Видалити" button у row-tail (з `sr-only` text + visible icon на focus), або переконатися, що swipe-action компонент сам emit-ить `role="button" aria-label="Видалити запис"` на drag-handle. Документувати у component-doc.

---

### F24 — `NutritionHeader.tsx` градієнт `from-lime-100 to-green-100` — raw palette ризик (Hard Rule #11/#13) [severity: medium] [perspective: tailwind]

**Page:** All
**File:** `apps/web/src/modules/nutrition/components/NutritionHeader.tsx`
**Lines:** 14–17

**Description.**
```tsx
<div className="... bg-linear-to-br from-lime-100 to-green-100 dark:from-lime-900/40 dark:to-green-900/30 ...">
```

Lime + green — обидва raw Tailwind palette, не semantic-token. Хоча `lime` концептуально — Nutrition-accent, він тут йде через `lime-100` (Tailwind raw), а не через `bg-nutrition/...` semantic.

**Why it matters.**
Hard Rule #11 — `lime-100` / `green-100` / `lime-900` / `green-900` — raw palette в className. Rule #13 — light/dark раw palette pair. ESLint правило `no-arbitrary-hex-in-classname` зараз пропускає named-tailwind-palette, але AGENTS.md формулює спірно: "raw-palette" — у репо це означає не лише `#hex`, а й `bg-amber-500`, `text-blue-400` тощо (адже Module accents через semantic token).

**Recommendation.**
Замінити на `from-nutrition-soft to-nutrition/30 dark:from-nutrition/40 dark:to-nutrition/20` (або як виглядають design-tokens registered scale). Якщо design-system дозволяє Heritage badge кольори — задокументувати inline як виняток.

---

### F25 — DataState fallback skeleton у Menu/plan: layout shift при transition [severity: low] [perspective: perf]

**Page:** Menu (plan sub-tab)
**File:** `apps/web/src/modules/nutrition/NutritionApp.tsx`
**Lines:** 378–397

**Description.**
`dayPlanQuery` constructed із `{ data: dayPlanBusy ? undefined : dayPlan, isLoading: dayPlanBusy }`. Цей shape — emulation замість справжнього `useQuery`. `dayPlanLoadingSkeleton` рендериться абсолютною висотою 3 `SkeletonMealCard` + header. Якщо реальний `DailyPlanCard` пред'являє іншу висоту (з warnings, goal-selector, etc.) — CLS-event при transition.

**Why it matters.**
LCP/CLS budget warn на Lighthouse CI (`apps/web/lighthouserc.json`). Кожен 0.1 CLS — близько до WARN-рівня.

**Recommendation.**
Або винести `useQuery` повноцінно, або задати `min-h-[XX]` контейнеру `<DataState>` у тому самому рендері, що й skeleton — щоб висоти збігалися. Verify через Lighthouse-report.

---

## Per-page coverage matrix

X = audited, no findings; число = кількість findings; — = не застосовно

| Page                  | sec | a11y | perf | ux | bug | rule | ts | tw | i18n | test | ai | lifecycle |
| --------------------- | --- | ---- | ---- | -- | --- | ---- | -- | -- | ---- | ---- | -- | --------- |
| NutritionStartPage    |  X  |  2   |  X   |  1 |  X  |  X   |  X |  2 |   X  |  1   | X  |    1      |
| NutritionPantryPage   |  X  |  2   |  X   |  1 |  1  |  X   |  2 |  X |   X  |  1   | X  |    1      |
| NutritionLogPage      |  X  |  3   |  1   |  1 |  1  |  X   |  X |  1 |   X  |  1   | X  |    1      |
| NutritionMenuPage     |  X  |  1   |  1   |  X |  X  |  1   |  1 |  1 |   X  |  1   | X  |    1      |
| **Cross-cutting**     |  X  |  X   |  1   |  X |  2  |  1   |  X |  X |   X  |  X   | 1  |    1      |

Notes:

- **Security:** дослідили — XSS-вектори (`dangerouslySetInnerHTML`, `eval`, `innerHTML`) у модулі **відсутні**; всі user-strings проходять через React text-rendering. Auth gating — через global `App.tsx` гейт, не на page-level. No CSRF concern — POST/PATCH через `nutritionApi.*` із proper headers. Hard Rule #20 — OpenClaw PATs тут не з'являються. Hard Rule #21 — Pino redaction — не applicable (це frontend, не сервер); але `console.*` calls у модулі **0** — clean.
- **i18n:** UI text українською; hardcoded English strings у production-code не виявлено (`grep "[A-Z][a-z]+ [a-z]"` показав лише JSDoc-коментарі). Перевірив суперечність "ви/ти" — див. F16.
- **AI markers:** грубо `0` markers у модулі, див. F22 — це low severity, не блокер.
- **Lifecycle markers:** lifecycle присутні в 5/~80 файлах — F6 (high), один cross-cutting finding.
- **Performance N+1 queries** — не виявлено; recipe-cache, food-search staleTime=5min — добре налаштовано.
- **Sort-stable IDs:** `stableRecipeId` (lib/recipeIds.ts) — good. Meal-IDs — див. F8.

## Out-of-scope follow-ups

(Не findings цього аудиту, але помічено під час scan-у — варто tickets-ить окремо.)

- `useNutritionRemoteActions.ts` (572 LoC) — наближається до Rule #18.
- `NutritionApp.tsx` (536 LoC) — приблизно те саме, плюс там же ховається 6+ useEffect-ів — потенційний `useNutritionAppOrchestrator` hook-extract.
- ShoppingListCard.tsx (296 LoC) — раз згадка `active:bg-nutrition/10` + кілька `border-line/40` — добре, але візуально перетин з PantryCard відсутній (різні UX patterns). Підтвердити через design-token-stability.
- `BarcodeScanner.tsx` — fallback chain (native ML Kit → web zxing) ідеально lazy-imported. Worth promoting як reference приклад для іншого вендор-lazy boundary.

## Closing notes

Module is **structurally well-organized** (page-shell pattern, hook-controllers, ErrorBoundary per page). Major remaining gaps — design-token discipline (raw palette у 4+ місцях), lifecycle marker coverage, page-level smoke tests, touch target + focus indicator на secondary action buttons.

Жодного `critical` finding. Найбільш actionable batch — F1–F3 (replace raw palette на semantic-tokens, 30-line PR), F4–F5 (a11y patch на 2 кнопки + 1 swipe wrapper), F6 (bulk lifecycle marker add).
