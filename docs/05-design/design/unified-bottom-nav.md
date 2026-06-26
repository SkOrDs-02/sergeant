# Unified Bottom Navigation

> **Last validated:** 2026-06-26 by @claude (form unification verified in code — divergence closed). **Next review:** 2026-09-24.
> **Status:** Active — **form unified**. `HubBottomNav` і `ModuleBottomNav` ділять один shell.

> **TL;DR:** Хаб і 4 модулі живуть під **одним** навігаційним патерном —
> `bottom-nav`. Hybrid «top-tabs у хабі + bottom-nav у модулях» більше немає.
>
> ✅ **Form unified (verified 2026-06-26).** Обидва nav використовують ІДЕНТИЧНИЙ
> shell — `bottom-nav-shell border border-line bg-panel shadow-lg` (floating pill:
> `mx-3`, `rounded-3xl`, `mb-[calc(env(safe-area-inset-bottom)+0.5rem)]`), і однаковий
> active-indicator — rounded **outline** (`rounded-2xl border`, не sliding top-pill).
> Module identity несе **колір outline**: `HubBottomNav` → `border-ink-strong/25`
> (brand-agnostic), `ModuleBottomNav` → `border-{module}/40` (module-tinted).
> Це і є target-стан, що раніше трекався як «pending PR-8» — закрито у redesign-v2
> (Phases 0–6, fully closed 2026-05-21). Реалізована форма відрізняється від раннього
> ескізу (`bg-panel` shell, не `bg-surface-strong-glass`; `rounded-3xl`, не `rounded-r-2xl`).

## Було → Стало

| Шар                                  | До                                      | Після                                         |
| ------------------------------------ | --------------------------------------- | --------------------------------------------- |
| Хаб                                  | `HubTabs` угорі (top-tab strip)         | `HubBottomNav` унизу (bottom-nav)             |
| Finyk / Fizruk / Routine / Nutrition | `ModuleBottomNav` унизу                 | без змін                                      |
| FAB «Асистент»                       | pill угорі над `safe-area-inset-bottom` | `compact` варіант 48×48, `76px` вище нав-бару |

## Чому

1. **Когнітивне навантаження.** Hybrid змушував юзера читати нав один раз
   зверху вниз (у хабі) і один раз знизу вгору (у модулі). Bottom-only =
   одна m.m. від thumb-a до всіх навігаційних цілей.
2. **Consistency контракт.** `HubTabs` і `ModuleBottomNav` дрейфували по
   висоті / блюру / активному індикаторі. Уніфікація через спільну форму.
3. **Безпечність зони пальця.** За iOS/Material 3 guidelines основна
   навігація має жити в thumb-zone — нижня третина екрану.

## Layout contract (hub shell)

```
<div h-dvh flex flex-col overflow-hidden safe-area-pt>
  <SkipLink />
  <HintsOrchestrator />
  <OfflineBanner />
  <HubHeader />            ← safe-area-top власним inline style
  <HubMainContent />       ← flex-1 overflow-y-auto; pb-28 для FAB clearance
  <HubBottomNav />         ← shrink-0 safe-area-pb; 60/64 px
  <HubFloatingActions compact />
  <ActiveWorkoutBanner />  ← bottom: 5.25rem + safe-area (над bottom-nav)
  <HubModals />
</div>
```

**Правила:**

- `h-dvh overflow-hidden` на wrapper — не `min-h-dvh`, інакше весь екран
  прокручується замість внутрішнього `HubMainContent`.
- `safe-area-pt` на wrapper (не `safe-area-pt-pb`), бо `HubBottomNav` сам
  додає `safe-area-pb` — інакше подвоюємо iOS inset.
- FAB (`HubFloatingActions`) завжди `compact` у хабі — piks-identичний
  з тим що рендериться в модулях.
- `ActiveWorkoutBanner` вже має `bottom: 5.25rem` (84 px), що вище
  60-64 px нав-бару. Без змін.

## `HubBottomNav` vs `ModuleBottomNav`

**Поточна реальність (verified 2026-06-26):** **одна форма.** Обидва nav ділять
shell `bottom-nav-shell` і outline-indicator; різниця лише в кольорі outline
(identity carrier). Контракт нижче — фактичний стан коду.

### Уніфікований контракт (shipped)

|                  | `HubBottomNav`                                           | `ModuleBottomNav`                                                                    |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Items            | 2-3 (Головна / Звіти? / Налаштування)                    | 4 per module (finyk/fizruk/routine/nutrition)                                        |
| Shell            | `bottom-nav-shell border border-line bg-panel shadow-lg` | `bottom-nav-shell border border-line bg-panel shadow-lg` (identical)                 |
| Shell shape      | `mx-3`, `rounded-3xl`, safe-area `mb`                    | identical (через `bottom-nav-shell` utility)                                         |
| Active indicator | rounded **outline** `rounded-2xl border`                 | rounded **outline** `rounded-2xl border` (identical mechanism)                       |
| Active tint      | `border-ink-strong/25` (brand-agnostic)                  | `border-{module}/40` (module-tinted — **identity carrier**)                          |
| `safe-area-pb`   | ✓ (через `bottom-nav-shell`)                             | ✓                                                                                    |
| `role`           | tablist                                                  | nav (default; tablist опційно)                                                       |
| Висота           | items `min-h-[48px]` / `pointer-coarse:52px`             | identical                                                                            |
| FAB integration  | N/A                                                      | Routine special-case: center FAB як sibling (z-index >, над pill); інші модулі — N/A |

> **Module identity:** несе **колір outline** активного таба (`border-{module}/40`),
> а не окрема форма. Hub лишається brand-agnostic (`border-ink-strong/25`). Це
> уніфікація без втрати модульної ідентичності.

> **PWA standalone vs browser:** `bottom-nav-shell` docks edge-to-edge у standalone
> (rounded лише зверху, фон заповнює safe-area) і floating-pill у браузері — деталі
> в JSDoc обох компонентів (`HubBottomNav.tsx`, `ModuleBottomNav.tsx`).

## Тестовий рецепт

- `pnpm --filter @sergeant/web exec vitest run src/core/app/HubBottomNav.test.tsx` → 7 тестів (3 таби, showReports toggle, tablist semantics, storage flag).
- Manual: на мобільному — нав лишається фіксованим при скролі контенту.
- A11y: всі таби мають `role="tab"`, `aria-selected`, `aria-controls`.

## Міграційний guidance

PR 5.2 видалив `HubTabs.tsx`. Якщо якийсь сторонній компонент посилався
на `HubTabs` (зовнішні stories, snapshot-и, тощо) — замінити на
`HubBottomNav` з тим самим API:

```diff
- import { HubTabs } from "@core/app/HubTabs";
+ import { HubBottomNav } from "@core/app/HubBottomNav";
- <HubTabs hubView={view} onChange={setView} showReports={hasEntries} />
+ <HubBottomNav hubView={view} onChange={setView} showReports={hasEntries} />
```

`hubView`, `onChange`, `showReports` — API-compatible.

## Anti-patterns

```tsx
// ❌ Додавати сторонні «top tabs» поруч з bottom-nav.
<HubHeader />
<SomeCustomTabStrip />   // ← візуальний гібрид знову
<HubMainContent />
<HubBottomNav />

// ✅ Якщо треба глобальний switcher — додати як окремий item у HubBottomNav
//    або окремим <select> у HubHeader.
```

```tsx
// ❌ Дублікувати `safe-area-pb` на wrapper і на nav.
<div className="safe-area-pt-pb">
  <HubBottomNav /> // ← також додає safe-area-pb → подвійний padding на iOS
</div>

// ✅ Wrapper має `safe-area-pt`, nav сам відповідає за свій `safe-area-pb`.
```

## Related docs

- `docs/05-design/design/module-accent.md` — `--module-accent` CSS var, як модулі
  оголошують свій ambient brand color.
- `docs/05-design/design/brandbook.md` — WCAG `-strong` tier, чому активні таби
  використовують `brand-strong` (а не `brand-500`).
- `apps/web/src/shared/components/ui/ModuleBottomNav.tsx` — sibling
  nav для модулів.
