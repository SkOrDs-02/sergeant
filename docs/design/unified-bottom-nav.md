# Unified Bottom Navigation

> **Last validated:** 2026-05-17 by @Skords-01 (post-PR-5 form divergence noted). **Next review:** 2026-08-15.
> **Status:** Active — **form unification pending PR-8 (ModuleBottomNav full v2 migration)**.

> **TL;DR:** Хаб і 4 модулі живуть під **одним** навігаційним патерном —
> `bottom-nav`. Hybrid «top-tabs у хабі + bottom-nav у модулях» більше немає.
>
> ⚠ **Form divergence active (2026-05-17):** PR-5 мігрував `HubBottomNav` на v2 floating glass pill (`mx-3 mb-3 rounded-r-2xl shadow-nav bg-surface-strong-glass`). `ModuleBottomNav` лишається на v1 flat panel (`bg-panel/95 backdrop-blur-xl border-t border-line` + top-pill 4px indicator). Decision locked 2026-05-17: **full v2 migration** для ModuleBottomNav — див. [`redesign-v2/handoff-package/Handoff for Claude Code.md`](./redesign-v2/handoff-package/Handoff%20for%20Claude%20Code.md) §3.2 + [`redesign-v2/execution-plan.md`](./redesign-v2/execution-plan.md) §Phase 2.5. Цей doc оновиться у тому ж PR.

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

**Поточна реальність (2026-05-17):** **різні форми**, виправлення locked у Phase 2.5 PR. Контракт нижче — це **target state після Phase 2.5** (full v2). Поточний `ModuleBottomNav` ще на v1 — фактичні відмінності див. block нижче.

### Target state (після Phase 2.5 ModuleBottomNav v2 PR)

|                  | `HubBottomNav` (v2, since PR-5)               | `ModuleBottomNav` (v2, target)                                                                  |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Items            | 2-3 (Головна / Звіти? / Налаштування)         | 4 per module (finyk/fizruk/routine/nutrition)                                                   |
| Shell shape      | `mx-3 mb-3 rounded-r-2xl shadow-nav`          | `mx-3 mb-3 rounded-r-2xl shadow-nav` (identical)                                                |
| Surface          | `bg-surface-strong-glass backdrop-blur-md`    | `bg-surface-strong-glass backdrop-blur-md` (identical)                                          |
| Active pill      | `bg-ink-strong` (brand-agnostic)              | `bg-{module}-strong` (module-tinted — identity carrier)                                         |
| `safe-area-pb`   | ✓ (через wrapper `padding-bottom: calc(...)`) | ✓                                                                                               |
| `role="tablist"` | ✓                                             | ✓ (опційно; за замовчуванням nav)                                                               |
| Висота           | 60 px / 64 px coarse                          | 60 px / 64 px coarse                                                                            |
| FAB integration  | N/A                                           | Routine special-case: center FAB як sibling (z-index >, top: -22 above pill); інші модулі — N/A |

> **Module identity transfer:** до Phase 2.5 module identity несе icon glow + top-pill gradient. Після Phase 2.5 — `bg-{module}-strong` pill background. Icon glow можна прибрати (redundant).

### Поточний state divergence (до Phase 2.5)

`ModuleBottomNav` ще використовує v1 shape:

- `bg-panel/95 motion-safe:backdrop-blur-xl border-t border-line` (flat panel)
- Sliding top-pill 4px indicator + drop-shadow icon glow
- Без `mx-3 mb-3 rounded-r-2xl shadow-nav`

Один екран бачить v2 mesh + glass cards + AIPill зверху і v1 flat nav знизу — **mosaic**. Це закрите рішенням PR-8 у локед послідовності.

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

- `docs/design/module-accent.md` — `--module-accent` CSS var, як модулі
  оголошують свій ambient brand color.
- `docs/design/brandbook.md` — WCAG `-strong` tier, чому активні таби
  використовують `brand-strong` (а не `brand-500`).
- `apps/web/src/shared/components/ui/ModuleBottomNav.tsx` — sibling
  nav для модулів.
