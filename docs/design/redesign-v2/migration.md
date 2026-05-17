# Sergeant v2 — Migration guide для розробників

> **Last validated:** 2026-05-17 by @codex. **Next review:** 2026-08-15.
> **Status:** Active

Цей doc — практичний reference для **engineers** які пишуть новий код або торкаються існуючого у post-v2-rollout world. Містить **BEFORE/AFTER** для типових патернів.

Для **governance** дивися [`redesign-v2.md`](./governance.md). Для **полірувального backlog** — [`redesign-v2-backlog.md`](./backlog.md).

## TL;DR (3 правила)

1. **Не чіпай v1 токени без причини.** `--c-bg`, `--c-panel`, `--c-text`, `--c-line` працюють і не deprecated yet (deprecation планується після PR-8 полірувань).
2. **Новий код — обирай v2.** Glass surfaces, `primary-ink`, `r-lg` radii, `surface-glass` — це v2 namespace. Старі компоненти не зачіпай "просто щоб мігрувати"; чіпай коли вони редизайняться по факту.
3. **Module shells уже у MeshBackground.** Не дублюй `bg-mesh` чи власні background — мережа вже на shell level (`MeshBackground.tsx`).

## Tokens — BEFORE / AFTER

### Background

```diff
-bg-bg            # v1: solid cream / dark
+bg-mesh          # v2: mesh-gradient utility (auto-degrades on HC + reduced-motion)
                  # ⚠ Лише на shell-rootах. Не використовуй на cards.

-<div className="h-dvh bg-bg flex flex-col overflow-hidden">
+<MeshBackground>
   {children}
+</MeshBackground>
```

### Card surfaces

```diff
-<Card>                                  # v1 default — solid white panel
+<Card prominence="glass" radius="r-lg">  # v2 — translucent floating glass
```

`prominence="glass"`:

- `bg-surface-glass` (alpha 0.82 light / 0.06 dark / 1.0 HC)
- `backdrop-blur-md`
- `border border-surface-line`
- `shadow-card-v2` (inset top highlight + soft drop)

`radius="r-lg"` (14 px) — v2 spec для primary cards. Опційно `r-xl` (18 px) для metric/sub-hero, `r-2xl` (24 px) для hero/sheet.

### Primary button

```diff
-<Button variant="primary">Зберегти</Button>     # v1: emerald-500 fill
+<Button variant="primary-ink">Зберегти</Button> # v2: ink-strong (#064e3b / white / #000)
```

Інвертується у dark/HC автоматично через `--c-ink-strong`. Module-specific CTAs (`variant="finyk"` тощо) — не зачіпай, вони `-strong` companion already AA.

### Module FAB (quick-add дії у модулі)

```diff
-<FloatingActionButton variant="finyk" icon="plus" onClick={addExpense} />
+<FloatingActionButton variant="v2-finyk" icon="plus" onClick={addExpense} />
```

`v2-{module}`: gradient `from-brand-400 to-teal-700` (finyk), `from-cyan-400 to-cyan-700` (fizruk), `from-coral-400 to-coral-700` (routine), `from-lime-400 to-lime-600` (nutrition). Paired з `shadow-fab` (v2 token).

### Hub-level sparkle / AI entry

```diff
-<FloatingActionButton icon="sparkle" onClick={() => navigate(CHAT_PATH)} />
+<AIPill module={null} bottom={96} />     # Hub
+<AIPill module="finyk" />                # All-module shells (bottom default 84)
```

AIPill internalizes `navigate(CHAT_PATH)`. Mic button is a sibling — не nested. Caller контролює FTUX-gating.

### Inline ink colors (text/border)

```diff
-text-text             # v1 → use it normally if context doesn't care
+text-ink              # v2 if you want stronger semantic intent
+text-ink-strong       # v2 display/heading slot (Manrope weight-800 looks best)

-border-line
+border-line-v2        # v2 — alpha 0.06 baked in (no opacity modifier supported)
+border-line-strong-v2 # v2 — 0.10 alpha — for major dividers
```

### Radii

| v1 (legacy)           | v2 (Sergeant redesign)       | Слот                             |
| --------------------- | ---------------------------- | -------------------------------- |
| `rounded-xl` (12 px)  | `rounded-r-md` (12 px alias) | CONTROL (buttons, chips)         |
| `rounded-2xl` (16 px) | `rounded-r-lg` (14 px)       | CARD (Cards primary)             |
| `rounded-3xl` (24 px) | `rounded-r-xl` (18 px)       | Metric cards                     |
| `rounded-3xl` (24 px) | `rounded-r-2xl` (24 px)      | Hero cards, sheets, AIPill, etc. |

**Не плутати**: `rounded-r-*` — v2 keys (suffix `-r-` від "redesign"). `rounded-2xl` досі = 16 px. Якщо ти у v2-glass-card-і, використовуй `rounded-r-lg` (14 px) — це **handoff spec**.

### Shadows

```diff
-shadow-card      # v1 → shadow-e1 (raised surface)
+shadow-card-v2   # v2 — glass-tuned (inset top highlight)
+shadow-pill      # v2 — AIPill, floating tags, pill-shaped chips
+shadow-nav       # v2 — HubBottomNav glass pill backdrop
+shadow-fab       # v2 — module FAB (teal-tinted glow baked in)
```

### Fonts

Manrope/JetBrains Mono підв'язані глобально у Tailwind preset `fontFamily.sans/display/mono`. Не треба ничого imports у компонентах — `font-sans`, `font-mono` resolve через стек з v1 fallback (DM Sans лишений до фінального bundle-size decision).

## Module shells — НЕ wrap'ай knownий module

Якщо ти **редагуєш** existing module entry (FinykApp/RoutineApp/тощо) — `<MeshBackground>` уже там. Якщо ти **створюєш новий module** — пляни:

```tsx
<ModuleAccentProvider module="newModule">  {/* без asShellRoot — MeshBackground візьме shell role */}
  <MeshBackground>
    <ModuleHeader ... />
    <main className="flex-1 ...">{children}</main>
    <ModuleBottomNav ... />
    <AIPill module="newModule" />
  </MeshBackground>
</ModuleAccentProvider>
```

ModuleShell-based modules (Fizruk) — додаси `<AIPill module="fizruk">` як child з `<ModuleShell>` (`fixed` position escape з flex column).

## Hard rules — повтор

| #   | Rule                                | v2 implication                                                                                            |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| #11 | No arbitrary hex у `className`      | Use semantic tokens. `bg-em-900/95` (handoff suggest) — заборонено. Use `bg-ink-strong`.                  |
| #12 | Module-accent containment           | MeshBackground НЕ publishes `--module-accent-rgb` — він монтується INSIDE ModuleAccentProvider, не зовні. |
| #13 | No raw light/dark className pairs   | Use `bg-surface-glass` not `bg-white dark:bg-stone-800`. Tokens flip themselves.                          |
| #14 | focus-visible:, not focus:          | AIPill + InsightCard уже compliant — copy їхній focus-visible:ring-2 pattern.                             |
| #16 | 12 px text floor                    | Handoff caption 10 px / overline 10 px → maps to existing `text-style-caption` (12 px).                   |
| #17 | Animation budget — max 2 concurrent | `.bg-mesh` AMBIENT — auto-stripped on `prefers-reduced-motion: reduce`.                                   |

## Insights — для PR що додають AI-triggered cards

```tsx
import { useInsightDismissal, type Insight } from "@shared/lib/insights";
import { InsightCard } from "@shared/components/ui";

function CoffeeInsight() {
  const { isDismissed } = useInsightDismissal();
  const id = `finyk-coffee-limit-${currentYearMonth()}`;

  if (isDismissed(id) || !shouldShowInsight(id)) return null;

  return (
    <InsightCard
      id={id}
      title="Витрати на каву ↑ 34%"
      subtitle="Встановити ліміт?"
      onActivate={() => navigate("/finyk/budgets?cat=coffee")}
    />
  );
}
```

Дивись [`redesign-v2-backlog.md` § Insights backlog](./backlog.md#insights-backlog-pr-7a-hook-scaffold-wire-actual-triggers-тут) для full list.

## HC mode — automatic

Усі v2 tokens мають HC overrides у `theme.css`. Engineer ничого не робить — `html.hc` activates strips:

- Mesh → solid `--c-bg-base`
- Glass alpha → 1.0 (opaque)
- Shadows → solid 2-3 px borders
- Hero gradients → solid module-strong

Якщо створюєш новий visual element — переконайся, що твої token references resolve чисто в HC. Stories для AIPill/InsightCard уже містять HC preview приклади.

## What НЕ робити (анти-патерни)

| ❌ Anti-pattern                                                           | ✅ Замість                                                           |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Власний `<div className="h-dvh bg-bg ...">` у module entry                | `<MeshBackground>`                                                   |
| Inline `rgba(255,255,255,0.82)` background                                | `bg-surface-glass`                                                   |
| `bg-em-900` (raw palette) для AI cards                                    | `bg-ink-strong text-bg-base`                                         |
| `<button onClick=mic><button onClick=chat>...</button></button>` (nested) | `<div role="group"><button>chat</button><button>mic</button></div>`  |
| `font-family: Manrope` inline                                             | Уже глобально через Tailwind `font-sans`                             |
| `import { CHAT_PATH } from "@core/app/appPaths"`                          | Relative `from "../../../core/app/appPaths"` (немає `@core/*` alias) |

## Refs

- `redesign-v2.md` — governance, adapter strategy, PR sequence
- `redesign-v2-backlog.md` — outstanding polish items
- `brandbook.md` — updated fizruk hex values
- `module-accent.md` — accent context contract
- `radius-rhythm.md` — radii semantic tiers
- Handoff: `D:\_unzipped\handoff\` (reference mockups + `final/` JSX)
