# @sergeant/design-tokens

Єдине джерело брендових дизайн-токенів Sergeant — кольори, типографія, opacity scale. Tailwind preset для web і mobile.

## Що всередині

| Файл                 | Призначення                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `tokens.js`          | Базові токени (кольори, chart-палітри, elevation, z-tier)                                           |
| `tailwind-preset.js` | Tailwind preset: шрифти, spacing, custom opacity scale (0–100 + спеціальний `8`), typography plugin |
| `mobile.js`          | Адаптовані токени для React Native (NativeWind)                                                     |
| `index.d.ts`         | TypeScript-типи для токенів                                                                         |
| `mobile.d.ts`        | TypeScript-типи для мобільних токенів                                                               |

## Використання

Preset — це звичайний JS-обʼєкт у форматі `tailwind.config`. Завантажуй його через `presets: […]` (Tailwind v3 / NativeWind) або `@config`-директиву (Tailwind v4) — токени, opacity scale і semantic typography pluginи однаково реєструються в обох runtime-ах.

```js
// tailwind.config.js (apps/web — Tailwind v4 та apps/mobile — NativeWind v4 / Tailwind v3)
import preset from "@sergeant/design-tokens/tailwind-preset.js";
export default { presets: [preset] /* … */ };
```

```css
/* apps/web/src/index.css — Tailwind v4 */
@import "tailwindcss";
@config "../tailwind.config.js"; /* підвантажує JS preset як shared layer між web ↔ mobile */
```

> **Чому JS preset, не CSS-first `@theme`?** Sergeant ділить токени між Vite-build (Tailwind v4) і NativeWind (досі на Tailwind v3 — див. [архівний план міграції](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/tailwind-v4-migration.md)). Один `tailwind-preset.js` працює в обох runtime-ах; `@theme`-блок було б потрібно дублювати у Metro-конфігу. Рішення зафіксоване Phase 3 міграційного плану.

## Дизайн-конвенції

Обидві конвенції тримаються tokens + design-review (ex-Hard Rules #8/#9, retired [ADR-0081](../../docs/04-governance/adr/0081-repository-simplification.md)) — ESLint їх більше не перевіряє.

- **Opacity scale:** тільки зареєстровані кроки (0, 5, 8, 10, 15, …, 100). Увага: Tailwind v4 компілює й arbitrary alpha (`/12`, `/37`) — білд не відкине off-scale крок, тож порушення ловиться лише на review.
- **`-strong` companion:** насичені brand fills під `text-white` мають використовувати `-strong` варіант.

## Команди

Усі скрипти `package.json`; з кореня — `pnpm --filter @sergeant/design-tokens <script>`.

```bash
pnpm --filter @sergeant/design-tokens typecheck  # no-op — пакет без TS-сорсів
pnpm --filter @sergeant/design-tokens lint       # no-op — пакет без TS-сорсів
pnpm --filter @sergeant/design-tokens test       # Vitest (snapshot-тести токенів)
```

## Глибше

- [`docs/05-design/design/brandbook.md`](../../docs/05-design/design/brandbook.md)
- [`docs/05-design/design/design-system.md`](../../docs/05-design/design/design-system.md)
