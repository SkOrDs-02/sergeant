# Unified Bottom Navigation

> **Last validated:** 2026-04-29 by @devin-ai. **Next review:** 2026-07-29.
> **Status:** Active

> **TL;DR:** Хаб і 4 модулі тепер живуть під **одним** навігаційним патерном —
> `bottom-nav`. Hybrid «top-tabs у хабі + bottom-nav у модулях» більше немає.

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

Однакова форма — два різні shell-и:

|                       | `HubBottomNav`                        | `ModuleBottomNav`                    |
| --------------------- | ------------------------------------- | ------------------------------------ |
| Items                 | 2-3 (Головна / Звіти? / Налаштування) | 4 per module (finyk/fizruk/...)      |
| Accent                | `brand` (module-agnostic)             | module color (finyk/teal/coral/lime) |
| `safe-area-pb`        | ✓                                     | ✓                                    |
| `role="tablist"`      | ✓                                     | ✓ (опційно; за замовчуванням nav)    |
| Висота                | 60 px / 64 px coarse                  | 60 px / 64 px coarse                 |
| Active indicator pill | `w-10 h-1` top, brand gradient        | `w-10 h-1` top, module gradient      |

> `HubBottomNav` — дорога копія `ModuleBottomNav` з brand-токенами, бо у
> хабі немає active module. Якщо колись захочемо reuse — винести
> `<BottomNavShell>` в shared і параметризувати gradient.

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

- `docs/design/MODULE-ACCENT.md` — `--module-accent` CSS var, як модулі
  оголошують свій ambient brand color.
- `docs/design/BRANDBOOK.md` — WCAG `-strong` tier, чому активні таби
  використовують `brand-strong` (а не `brand-500`).
- `apps/web/src/shared/components/ui/ModuleBottomNav.tsx` — sibling
  nav для модулів.
