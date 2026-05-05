# @sergeant/design-tokens

Єдине джерело брендових дизайн-токенів Sergeant — кольори, типографія, opacity scale. Tailwind preset для web і mobile.

## Що всередині

| Файл                 | Призначення                                                      |
| -------------------- | ---------------------------------------------------------------- |
| `tokens.js`          | Базові токени (кольори, шрифти, spacing)                         |
| `tailwind-preset.js` | Tailwind preset з custom opacity scale (0–100 + спеціальний `8`) |
| `mobile.js`          | Адаптовані токени для React Native (NativeWind)                  |
| `index.d.ts`         | TypeScript-типи для токенів                                      |
| `mobile.d.ts`        | TypeScript-типи для мобільних токенів                            |

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

> **Чому JS preset, не CSS-first `@theme`?** Sergeant ділить токени між Vite-build (Tailwind v4) і NativeWind (досі на Tailwind v3 — див. `docs/planning/tailwind-v4-migration.md`). Один `tailwind-preset.js` працює в обох runtime-ах; `@theme`-блок було б потрібно дублювати у Metro-конфігу. Рішення зафіксоване Phase 3 міграційного плану.

## Hard-rules

- **Opacity scale:** тільки зареєстровані кроки (0, 5, 8, 10, 15, …, 100). Інші — silently dropped Tailwind. Див. [AGENTS.md #8](../../AGENTS.md).
- **`-strong` companion:** насичені brand fills під `text-white` мають використовувати `-strong` варіант. Див. [AGENTS.md #9](../../AGENTS.md).

## Тести

```bash
pnpm --filter @sergeant/design-tokens test  # snapshot-тести токенів
```

## Глибше

- [`docs/design/brandbook.md`](../../docs/design/brandbook.md)
- [`docs/design/design-system.md`](../../docs/design/design-system.md)
