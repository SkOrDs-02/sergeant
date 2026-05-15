# Sergeant v2 Redesign

> **Last validated:** 2026-05-15 by @Skords-01. **Next review:** 2026-08-13.
> **Status:** Active (rollout in PR-0..PR-8)

## Контекст

У травні 2026 Claude Design передав повний візуальний v2 редизайн всього продукту — `D:\_.zip` → `D:\_unzipped\handoff\`. Він містить:

- `01-tokens-diff.md` — точна різниця токенів (light + dark)
- `02-component-map.md` — компонент-by-компонент мапа змін
- `03-new-components.md` — специфікації нових компонентів (AIPill, InsightCard, MeshBackground)
- `04-pr-sequence.md` — 8-PR breakdown
- `final/` — reference JSX + theme.css + усі 27 екранів
- `design-system.html` + `screens/` Part 1-3 — інтерактивні мокапи (light/dark toggle)

**Скоп:** тільки візуальний шар (22+ екранів). Без змін у роутингу (`router.tsx`, `appPaths.ts`), sync (`@sergeant/db-schema`, `CloudSync`), бізнес-логіці, API-контрактах, або структурі модулів.

**Цільовий результат:** візуальна паритетність з мокапами `screens/Part-{1,2,3}.html`. Архітектурна послідовність зберігається з Sergeant конвенціями (триплети для opacity-modifier, semantic tokens, hard rules).

## Що змінюється

| Шар | До (v1) | Після (v2) |
|---|---|---|
| Шрифт | DM Sans Variable | **Manrope** 400-800 + JetBrains Mono (PR-2) |
| Background | Flat `--c-bg` (`#fdf9f3`) | **Mesh-gradient** 4 corner radials + `--c-bg-base` |
| Cards | Solid `--c-panel` + hairline | **Floating glass** `--surface-glass` (alpha 0.82 light / 0.06 dark) + `backdrop-blur` + inset highlight |
| Hero blocks | Subtle gradient washes | **Bright module-tinted** `--hero-grad-{module}` linear gradients |
| Icons (system) | Mix emoji + custom registry | **Lucide-style stroke 2px** (PR-3) |
| HubBottomNav | Flat panel + top-pill indicator | **Floating glass pill** mx-3/mb-3 (PR-5) |
| AI access | Sparkle 40×40 в header + FAB на dashboard | **AIPill** persistent + **InsightCard** push (PR-7) |
| Module `--fizruk` accent | `#14b8a6` teal-500 | `#0e7490` cyan-700 (PR-0 ✅) |
| Module `bg-fizruk-strong` | `#0f766e` teal-700 | `#155e75` cyan-800 (PR-1) |

## Adapter strategy — token shape

Хендоф використовує прямі hex/rgba у CSS variables. Sergeant використовує **RGB-triplet pattern** (`--c-bg: 253 249 243;`) аби підтримувати Tailwind alpha-modifier syntax (`bg-panel/95`). Сліпе копіювання зламало б 80+ існуючих call sites.

**Рішення: Additive coexistence (hybrid).** Існуючі `--c-*` токени не перейменовуються; v2 додаються паралельно.

### Token sub-namespaces у v2

1. **Solid ink tokens — triplets** (підтримують opacity-modifier):
   - `--c-bg-base` — warm cream base під mesh
   - `--c-ink`, `--c-ink-strong` — body + display ink
   - `--c-muted-v2`, `--c-subtle-v2` — meta + hints

2. **Alpha-baked glass + hairline tokens — full rgba strings** (alpha закодований у самій змінній, opacity-modifier недоступний):
   - `--surface-glass`, `--surface-strong-glass`, `--surface-soft-glass`
   - `--surface-line` — inset hairline для skeumorphic glass
   - `--line-v2`, `--line-strong-v2`
   - `--bg-mesh-1..4`

3. **Shadows — full rgba strings** (multiple shadow recipes):
   - `--shadow-card-v2`, `--shadow-pill`, `--shadow-nav`, `--shadow-fab`

4. **Hero gradients — `linear-gradient(...)` strings** per module:
   - `--hero-grad-finyk`, `--hero-grad-fizruk`, `--hero-grad-routine`, `--hero-grad-nutrition`

5. **Radii — Tailwind v2 keys** (`rounded-r-md/lg/xl/2xl`):
   - `r-md` 12px, `r-lg` 14px, `r-xl` 18px, `r-2xl` 24px
   - Існуючий `rounded-2xl` (16px) НЕ чіпаємо — нові hero/sheet surfaces використовують `rounded-r-2xl`

## PR sequence

| PR | Розмір | Статус | Зміст |
|---|---|---|---|
| **PR-0** | XS | ✅ | `--fizruk` hue change `#14b8a6 → #0e7490` (teal-500 → cyan-700) |
| **PR-1** | M | 🔄 цей PR | Foundation tokens v2 namespace (mesh, shadows, radii, HC overrides) + cyan палітра + governance doc |
| PR-2 | S | ⏳ | `@fontsource-variable/manrope` + `@fontsource/jetbrains-mono` self-hosted; Tailwind fontFamily |
| PR-3 | M | ⏳ | Audit & extend Lucide-style Icon registry; emoji → SVG у navigation/headers |
| PR-4 | M | ⏳ | Card + Button + Badge + FAB — glass treatment, primary → ink-strong invert, FAB module-aware |
| PR-5 | M | ⏳ | New `MeshBackground.tsx`, HubHeader styling, HubBottomNav floating glass pill |
| PR-6 | M | ⏳ | Module shells × 4 → wrap у MeshBackground (всередині `ModuleAccentProvider`) |
| PR-7a | M | ⏳ | `AIPill.tsx` + `InsightCard.tsx` + `useInsightDismissal` hook + типи `Insight` (Zod) |
| PR-7b | M | ⏳ | `ChatSheet.tsx` як modal-route + insight wiring |
| PR-8 | M | ⏳ | Per-module page polish (Overview/Analytics/Transactions/Workout) + bundle-size gate |

## HC contract — новий внесок (хендоф не покривав)

Sergeant має AAA-leaning HC mode (`html.hc { … }`). Для v2 tokens:

| Токен | HC light | HC dark |
|---|---|---|
| `--bg-mesh-1..4` | **0 alpha** | **0 alpha** — mesh disorients low-vision; HC = solid base |
| `--surface-glass` | `rgba(255 255 255 / 1)` | `rgba(32 28 25 / 1)` — strip alpha |
| `--surface-strong-glass` | `rgba(255 255 255 / 1)` | `rgba(48 42 37 / 1)` |
| `--surface-soft-glass` | `rgba(255 255 255 / 0.95)` | `rgba(32 28 25 / 0.95)` |
| `--c-ink-strong` | `0 0 0` | `255 255 255` |
| `--line-v2` | `rgba(0 0 0 / 0.35)` | `rgba(255 255 255 / 0.45)` |
| `--line-strong-v2` | `rgba(0 0 0 / 0.60)` | `rgba(255 255 255 / 0.70)` |
| `--shadow-card-v2/pill/nav/fab` | Solid 2-3px borders | Same — HC ignores depth |
| `--hero-grad-{module}` | Solid `--{module}-strong` | Brighter solid module color |

`.bg-mesh` utility class автоматично degrade'ить до solid `rgb(var(--c-bg-base))` коли `html.hc` або `@media (prefers-reduced-motion: reduce)` активні.

## Renames НЕ робимо

Хендоф пропонує глобальні search-replace `--bg → --bg-base`, `--text → --ink`, `--border → --line`. Ці rename'и **зламають** Sergeant:

- `--bg → --bg-base` зламає Tailwind preset (`rgb(var(--c-bg) / <alpha-value>)`)
- `--text → --ink` зламає `text` Tailwind utility namespace
- `--border → --line` зламає `border` Tailwind utility namespace

Замість renames — **aliases** у `theme.css` додаємо нові імена що читають старі triplet значення (наприклад `--c-bg-base: 240 233 216;` як прямий триплет, паралельний до `--c-bg`).

## Risks & mitigations

1. **iOS Capacitor + `background-attachment: fixed`** регресує у Safari. Fallback: `position: absolute inset-0` div під контентом. Тест у PR-5 на mobile-shell preview.
2. **Bundle size near 900kB JS / 28kB CSS budget**. Manrope (≈40kB) + JetBrains Mono (≈25kB) + нові SVG paths. Subset Manrope до Latin + Cyrillic Extended. Drop unused weights. Measure pre/post кожного PR.
3. **`InsightCard` localStorage key collision** — централізувати через `useInsightDismissal` hook + namespace `sergeant.v2.insights.dismissed`.
4. **AIPill nested-button a11y bug у handoff JSX** — refactor у `<div role="group">` parent + два sibling `<button>` (placeholder tap + mic).
5. **Module-accent containment** (Hard Rule #12) — MeshBackground НЕ публікує `--module-accent-rgb`. Хелпер монтується всередині `ModuleAccentProvider`, не зовні.

## Verification

`pnpm check` після кожного PR. Додатково:

- PR-0 ✅: `pnpm -F @sergeant/design-tokens test` — 23/23 pass; mobile typecheck clean
- PR-1: `pnpm size-limit` baseline; Storybook smoke build; новий cyan палітра snapshot
- PR-2: Network panel — woff2 локальні, не CDN
- PR-3: Icon.test.tsx + Storybook візуальний diff
- PR-4: Existing `Card.test.tsx`/`Button.test.tsx`/`Badge.test.tsx` pass unchanged; нові Storybook snapshots з glass variants
- PR-5: Playwright snapshot HubHomeView; mobile-shell preview на iOS
- PR-6: Playwright snapshots × 4 module shells; module-accent containment audit
- PR-7a: axe a11y scan AIPill story; localStorage mock test InsightCard
- PR-7b: Programmatic `navigate` test → assert background route still rendered
- PR-8: `pnpm size-limit` фінал ≤ 900kB JS / 28kB CSS brotli; knip clean; full Playwright

**HC verification:** для кожного нового компонента додати `[data-theme-preview="hc-light"]` + `hc-dark` Storybook stories.

## Open questions

- **DM Sans retire** у PR-8 vs лишити як fallback indefinitely — залежить від фінального `pnpm size-limit` (вирішується в PR-8).
- **Manrope subset breakpoint** — повний (Latin + Cyrillic Extended + Greek) ≈ 65kB vs тільки Latin + Cyrillic Extended (UA-first) ≈ 40kB. PR-2 пробує обидва і вибирає на основі бюджету.

## Refs

- Локальний plan: `C:\Users\dmytr\.claude\plans\d-zip-refactored-starlight.md`
- Хендоф: `D:\_unzipped\handoff\` (особливо `01-tokens-diff.md`, `04-pr-sequence.md`)
- Існуючий design system: `docs/design/design-system.md`, `docs/design/brandbook.md`, `docs/design/module-accent.md`
- Pull requests: PR-0 ([#2902](https://github.com/Skords-01/Sergeant/pull/2902))
