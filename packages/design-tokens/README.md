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

```js
// tailwind.config.js (apps/web)
import preset from "@sergeant/design-tokens/tailwind-preset.js";
export default { presets: [preset] /* … */ };
```

## Hard-rules

- **Opacity scale:** тільки зареєстровані кроки (0, 5, 8, 10, 15, …, 100). Інші — silently dropped Tailwind. Див. [AGENTS.md #8](../../AGENTS.md).
- **`-strong` companion:** насичені brand fills під `text-white` мають використовувати `-strong` варіант. Див. [AGENTS.md #9](../../AGENTS.md).

## Тести

```bash
pnpm --filter @sergeant/design-tokens test  # snapshot-тести токенів
```

## Глибше

- [`docs/design/BRANDBOOK.md`](../../docs/design/BRANDBOOK.md)
- [`docs/design/design-system.md`](../../docs/design/design-system.md)
