# Module-accent — канонічний reference

> **Last validated:** 2026-04-29 by @devin-ai. **Next review:** 2026-07-29.
> **Status:** Active

> Sergeant — 4 модулі з власним брендовим кольором. Замість того, щоб кожен компонент отримував пропс `module="finyk"` / `module="fizruk"` й мапив це у `bg-finyk` / `bg-fizruk`, ми публікуємо активний акцент як CSS-variable на дереві модуля і маємо одну Tailwind-утиліту, що тягне цей колір у будь-яку поверхню всередині модуля.

## TL;DR

```tsx
<ModuleShell module="finyk" ...>
  <div className="bg-module-accent/10 border border-module-accent/30" />
  <button className="bg-module-accent-strong text-white">CTA</button>
</ModuleShell>
```

- `bg-module-accent` → активний module-колір (`finyk`=emerald-500, `fizruk`=teal-500, `routine`=coral-500, `nutrition`=lime-500).
- `bg-module-accent-strong` → WCAG-AA `-strong`-companion для фонів під `text-white` (clears 4.5 : 1).
- Використовується у спільних компонентах, які живуть у 4 модулях — без hardcoded `bg-finyk` / `bg-fizruk`-лукапів.

## Три шари

```
┌─────────────────────────────────────────────────────────┐
│  packages/design-tokens/tokens.js  (single source)     │
│  └─ moduleAccentRgb = {                                │
│       finyk:     { default: "16 185 129", strong: …}   │
│       fizruk:    { default: "20 184 166", strong: …}   │
│       routine:   { default: "249 112 102", strong: …}  │
│       nutrition: { default: "146 204 23", strong: …}   │
│     }                                                   │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  ModuleAccentProvider / ModuleShell                    │
│  └─ writes:                                            │
│       --module-accent-rgb: <default>                   │
│       --module-accent-strong-rgb: <strong>             │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Tailwind preset                                        │
│  └─ registers:                                         │
│       module-accent: rgb(var(--module-accent-rgb)/…)   │
│       module-accent-strong: rgb(var(--…-strong-rgb)/…) │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
              `bg-module-accent/10`
              `text-module-accent`
              `bg-module-accent-strong text-white`
              `border-module-accent/30`
              … будь-яка Tailwind color-утиліта працює
```

## Правила

1. **Редагуйте RGB-трійки лише у `packages/design-tokens/tokens.js`.** Вони мають співпадати з `moduleColors.{module}.primary` (для `default`) і WCAG-AA-companion-shade (для `strong` — зазвичай `-700`, окрім nutrition/lime, який бере `-800`). Не повторно-оголошуйте їх у React-компонентах.

2. **`bg-module-accent*` працює лише всередині `ModuleAccentProvider` або `ModuleShell` із пропом `module`.** Поза цим — `--module-accent-rgb` не визначений і утиліта розреш-литься у `rgb( )` — фактично прозоро. Якщо ви робите компонент, який може рендеритись standalone (наприклад, Storybook, hub-level page-loader), лишіть явний `module`-проп + `bg-{module}/10`-fallback.

3. **`-strong` — під `text-white`.** Сатуровані `-500`-shade-и регресують до ~2.4–2.8 : 1 проти білого. Див. [`docs/design/BRANDBOOK.md`](./BRANDBOOK.md) § WCAG-AA `-strong` Tier — повна per-family-таблиця контрасту.

4. **Hub-chrome лишається нейтральним.** `HubHeader`, `HubTabs`, `HubDashboard`, HubChat, дашборди з усіма 4 модулями поряд — мають тримати токени `bg-brand-*` (нейтральна палітра Sergeant) або мікс-тити per-module-токени за іменем. НЕ використовуйте `bg-module-accent*` тут — немає ambient-модуля.

## Міграція (інкрементально, без big-bang)

`bg-module-accent*` — **аддитивне**. Існуючі `bg-finyk` / `bg-fizruk` / тощо досі працюють. Мігруйте по одній поверхні за раз, коли поверхня вже стайл-иться через `ModuleAccentProvider`:

```diff
  // Inside FinykApp.tsx, NutritionApp.tsx, etc.
- <div className="rounded-2xl bg-finyk-soft/40 dark:bg-finyk-surface-dark/8" />
+ <div className="rounded-2xl bg-module-accent/8 dark:bg-module-accent/10" />
```

Гарні кандидати на міграцію:

- Спільні `Skeleton*`-плейсхолдери з `module`-пропом — drop-aйте проп, коли skeleton завжди рендериться всередині `ModuleAccentProvider`.
- Sub-секції `ModulePageLoader` (`FinykLoader`, `FizrukLoader`, …) — обʼєднуються в один `ModuleLoader`, який читає ambient-акцент.
- Tint-washes на `Card` / `Sheet` overlay-ях — однакова opacity 8 % / 10 % / 15 % між модулями.

НЕ мігруйте:

- `WelcomeScreen.tsx`, `ModuleChecklist.tsx`, `moduleConfigs.tsx`, `HubInsightsPanel.tsx` — показують кілька модулів поряд. Кожна картка має нести власний хардкоднутий module-токен (`bg-finyk-soft`, `bg-fizruk-soft`, …), бо немає ambient-акценту.
- Module-варіанти `Button` (`variant="finyk"` / `module="finyk"`) — вони явно обирають модуль; так API чіткіший.
- Будь-що всередині `core/**` (hub-level). Hub — module-agnostic.

## Анти-патерни

```tsx
// ❌ BAD — хардкоднута RGB-трійка в React; дрейфне від Tailwind
<div style={{ backgroundColor: "rgb(16 185 129 / 0.1)" }} />

// ❌ BAD — таблиця-лукап, що переповнює те, що Tailwind уже дає
const TINT = {
  finyk: "bg-finyk/10",
  fizruk: "bg-fizruk/10",
  /* ... */
};
<div className={TINT[module]} />

// ❌ BAD — `bg-module-accent/10` поза `ModuleAccentProvider`
// (рендериться прозоро; готуйтесь до годин дебагу)
<HubDashboard>
  <div className="bg-module-accent/10" />  {/* ← немає ambient-акценту */}
</HubDashboard>

// ❌ BAD — чужий module-accent у subtree іншого модуля
// apps/web/src/modules/fizruk/pages/PlanCalendar.tsx
<button className="focus-visible:ring-routine">…</button>
// (coral focus-ring читається користувачем як «Рутина», а не «Фізрук»)
// Enforced by `sergeant-design/no-foreign-module-accent` (error).

// ✅ GOOD — ambient-акцент усередині поверхні модуля
<ModuleShell module="routine">
  <Card className="bg-module-accent/8 border-module-accent/20" />
  <Button className="bg-module-accent-strong text-white">Зберегти</Button>
</ModuleShell>
```

### Module-accent containment (`sergeant-design/no-foreign-module-accent`)

Усередині `apps/<app>/src/modules/<X>/` дозволені лише акцент-утиліти `<X>` (`bg-<X>-surface`, `text-<X>-strong`, `ring-<X>`, `bg-<X>-500/15`, …). Правило прозоро обробляє variant-prefix-и (`dark:`, `hover:`, `lg:`), shade-suffix-и (`-500`, `-soft`, `-strong`) і opacity-suffix-и (`/15`).

Виключені subtree-и (вільно посилаються на всі акценти):

- `apps/*/src/core/**`, `apps/*/src/shared/**`, `apps/*/src/stories/**` — cross-module-shell / Hub / HubChat.
- `apps/*/src/modules/shared/**` — не-канонічна module-папка; cross-module-утиліта, не власник акценту.
- `__tests__/*.{ts,tsx,mjs}` — test-fixture-и природно посилаються на всі чотири для покриття.

Hard-rule #12 у `AGENTS.md` — повна специфікація. Анти-патерн «file-at-a-time» вище — `fizruk`-сторінка з `ring-routine` — це саме те, що правило ловить:

```tsx
// ❌ BAD
<button className="focus-visible:ring-routine" />
// ✅ GOOD
<button className="focus-visible:ring-fizruk" />
```

### Без arbitrary-hex-кольорів (`sergeant-design/no-hex-in-classname`)

Не пишіть `bg-[#10b981]` / `text-[#fff]/50` / `ring-[#1234ab]` усередині `className`. Сирий hex-літерал обходить уся три-шарову систему вище — `--module-accent-rgb` не може його тонувати, `-strong`-companion для нього не існує, а dark-mode не може його адаптувати. Якщо вам справді потрібен новий shade — додайте його в `packages/design-tokens/tailwind-preset.js` (із `-soft` / `-strong`-companion-ом за rule #9 у `AGENTS.md`). Enforced by `sergeant-design/no-hex-in-classname` (error); див. hard-rule #11 у `AGENTS.md`.

## API

### Design-токени (`@sergeant/design-tokens/tokens`)

```ts
export const moduleAccentRgb: Record<
  ModuleAccent,
  {
    default: string; // "R G B" (saturated -500)
    strong: string; // "R G B" (WCAG-AA -700/-800)
  }
>;
```

### React (`@shared/components/layout`)

```ts
// Writes CSS vars + provides useModuleAccent() context.
<ModuleAccentProvider module="finyk">...</ModuleAccentProvider>
<ModuleShell module="finyk" header={…} nav={…}>...</ModuleShell>

// Active accent ("finyk" | "fizruk" | "routine" | "nutrition" | null).
const accent = useModuleAccent();
```

### Tailwind

```
bg-module-accent           bg-module-accent-strong
bg-module-accent/10        bg-module-accent-strong/90
text-module-accent         text-module-accent-strong
border-module-accent       border-module-accent-strong
ring-module-accent         ring-module-accent-strong
```

Усі стандартні Tailwind opacity-modifier-и із зареєстрованої шкали (`0, 5, 8, 10, 15, 20, 25, …`) працюють. Не зареєстровані кроки (`/12`, `/18`) тихо дропаються — див. hard-rule #8 у `AGENTS.md`.

## Тестування

```ts
import { moduleAccentRgb } from "@sergeant/design-tokens/tokens";
import { ModuleAccentProvider } from "@shared/components/layout";

it("публікує --module-accent-rgb + strong для finyk", () => {
  const { container } = render(
    <ModuleAccentProvider module="finyk">
      <div />
    </ModuleAccentProvider>,
  );
  const wrapper = container.firstChild as HTMLElement;
  expect(wrapper.style.getPropertyValue("--module-accent-rgb")).toBe(
    moduleAccentRgb.finyk.default,
  );
  expect(wrapper.style.getPropertyValue("--module-accent-strong-rgb")).toBe(
    moduleAccentRgb.finyk.strong,
  );
});
```

`ModuleAccentProvider.test.tsx` покриває всі 4 модулі + data-атрибут.

## Пов'язані доки

- [`docs/design/BRANDBOOK.md`](./BRANDBOOK.md) — WCAG-AA `-strong` Tier
  - повна per-family-таблиця контрасту.
- [`docs/design/brand-palette-wcag-aa-proposal.md`](./brand-palette-wcag-aa-proposal.md) — migration-історія (PR-и #854 / #855 / #857).
- `AGENTS.md` hard rule #8 — Tailwind opacity scale.
- `AGENTS.md` hard rule #9 — `-strong`-companion під `text-white`.
- `AGENTS.md` hard rule #11 — no arbitrary hex colors in `className`.
- `AGENTS.md` hard rule #12 — module-accent containment.
- [`docs/design/DARK-MODE-AUDIT.md`](./DARK-MODE-AUDIT.md) — pending міграційний план із 28 raw-palette `dark:`-патчів у семантичні токени (`bg-{module}-surface`, `bg-{status}-soft`, і Wave-1b target-токени `bg-brand-soft` / `border-brand-soft-border` / `-soft-hover`, які увійдуть у preset одночасно з міграцією).
