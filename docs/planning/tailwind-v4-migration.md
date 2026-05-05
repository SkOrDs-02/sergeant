# Міграція Tailwind CSS v3 → v4

> **Last validated:** 2026-05-05. **Next review:** 2026-08-04.
> **Status:** Phase 1 (web) — ✅ done ([#1495](https://github.com/Skords-01/Sergeant/pull/1495), follow-up [#1499](https://github.com/Skords-01/Sergeant/pull/1499)). Phase 2 (mobile/NativeWind) — blocked, чекаємо NativeWind 5. Phase 3 (design tokens — preset decision + docs) — ✅ done. Phase 4 (cleanup) — ✅ done крім фінального переключення статусу на Completed (чекає закриття Phase 2).
> **Owner:** @Skords-01
> **Пріоритет:** Medium — запланувати на Q3–Q4 2026.
> **Estimated effort:** 2–3 дні (з automated upgrade tool).

## Навіщо мігрувати

Tailwind CSS v4 (випущений 22 січня 2025) — повний rewrite engine:

- **Full builds до 5× швидші**, incremental builds до 100× швидші (мікросекунди замість мілісекунд)
- **Менший CSS output** — новий engine генерує тільки ті стилі, які реально використовуються
- **CSS-first конфігурація** — `@theme` в CSS замість `tailwind.config.js`
- **Автоматичне виявлення контенту** — `content: [...]` більше не потрібно
- **Нативний import і vendor prefixing** — `postcss-import` і `autoprefixer` більше не потрібні
- **Нові утиліти** — `inset-shadow-*`, `text-shadow-*`, container queries, `@starting-style`, нові градієнти

## Поточний стан проєкту

### Файли, які потребують міграції

| Файл                                        | Що містить                                                 | Складність          |
| ------------------------------------------- | ---------------------------------------------------------- | ------------------- |
| `apps/web/tailwind.config.ts`               | Preset import, content globs, darkMode, plugins            | Низька              |
| `apps/web/postcss.config.mjs`               | `tailwindcss` + `autoprefixer` plugins                     | Низька              |
| `apps/web/src/index.css`                    | `@tailwind base/components/utilities` директиви            | Низька              |
| `apps/mobile/tailwind.config.js`            | NativeWind + design-tokens preset, CJS format              | Висока (NativeWind) |
| `packages/design-tokens/tailwind-preset.ts` | Shared preset з темою, кольорами, анімаціями (~200 рядків) | Середня             |

### Ключові залежності

- `tailwindcss: ^3.4.17` → потрібно `^4.0.0`
- `postcss` — `@tailwindcss/postcss` замінює `tailwindcss` як PostCSS plugin
- `autoprefixer` — видалити (вбудовано в v4)
- `nativewind: ^4.1.23` — **БЛОКЕР**: NativeWind 4 побудований на Tailwind 3. Потрібно чекати NativeWind 5 або підтвердження сумісності

## Що зміниться (breaking changes)

### 1. CSS-first конфігурація

**До (v3):** `tailwind.config.ts`

```ts
import designTokensPreset from "@sergeant/design-tokens/tailwind-preset";
export default {
  presets: [designTokensPreset],
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
};
```

**Після (v4):** все в CSS

```css
@import "tailwindcss";
@config "./tailwind.config.ts"; /* якщо потрібна складна конфігурація */

/* Або повністю в CSS: */
@theme {
  --color-brand: #10b981;
  --font-sans: "DM Sans Variable", system-ui, sans-serif;
}
```

### 2. PostCSS конфігурація

**До:**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**Після:**

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

### 3. CSS директиви

**До:**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Після:**

```css
@import "tailwindcss";
```

### 4. Перейменовані утиліти

| v3               | v4                       | Примітка                                                              |
| ---------------- | ------------------------ | --------------------------------------------------------------------- |
| `shadow-sm`      | `shadow-xs`              | Зміщені на один рівень вниз                                           |
| `shadow`         | `shadow-sm`              |                                                                       |
| `shadow-md`      | `shadow-md`              | Без змін                                                              |
| `ring`           | `ring-3`                 | Дефолтна товщина тепер явна                                           |
| `blur`           | `blur-sm`                | Зміщені                                                               |
| `rounded`        | `rounded-sm`             | Зміщені                                                               |
| `border`         | `border`                 | Без змін, але дефолтний колір тепер `currentColor` замість `gray-200` |
| `outline-none`   | `outline-hidden`         | `outline-none` тепер `outline-style: none`                            |
| `text-opacity-*` | `text-{color}/{opacity}` | Opacity модифікатори замість окремих класів                           |
| `bg-opacity-*`   | `bg-{color}/{opacity}`   | Те саме                                                               |

### 5. Зміни в design-tokens preset

Наш `packages/design-tokens/tailwind-preset.ts` використовує `rgb(var(--c-bg) / <alpha-value>)`. У Tailwind 4 синтаксис alpha-value змінився — потрібно перевірити сумісність CSS custom properties з новим engine.

### 6. Dark mode

`darkMode: "class"` → у v4 dark mode працює через медіа-запит за замовчуванням. Для class-based:

```css
@import "tailwindcss";
@variant dark (&:where(.dark, .dark *));
```

## План міграції

### Фаза 0: Передумови (до початку)

- [ ] Перевірити що NativeWind 5 (або NativeWind 4 з Tailwind 4 підтримкою) доступний
- [ ] Зробити git tag поточного стану: `git tag pre-tailwind-v4-migration`
- [ ] Переконатися що всі CI чеки зелені

### Фаза 1: Web app (apps/web) — ✅ done

Закрита у [#1495](https://github.com/Skords-01/Sergeant/pull/1495) (`feat(web): migrate Tailwind CSS v3 → v4`) + follow-up [#1499](https://github.com/Skords-01/Sergeant/pull/1499) (`chore(deps): regenerate THIRD_PARTY_LICENSES after Tailwind v4 migration`). Кроки, які реально виконано:

1. ✅ Створено фічер-бранч і запущено automated upgrade tool: `npx @tailwindcss/upgrade` у `apps/web`
2. ✅ `postcss.config.mjs` переведено на `@tailwindcss/postcss` (замість `tailwindcss` + `autoprefixer`)
3. ✅ `index.css` тепер використовує `@import "tailwindcss"` замість `@tailwind` директив
4. ✅ `packages/design-tokens/tailwind-preset.ts` залишено через `@config` директиву (shared preset між web/mobile)
5. ✅ Alpha-value синтаксис для CSS variable кольорів перевірено
6. ✅ Перейменовані утиліти (shadow, ring, rounded, border color) пройдено
7. ✅ `pnpm dev:web` візуально пройдено
8. ✅ `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — green
9. ✅ Argos visual regression — порівняння до/після пройдено

### Фаза 2: Mobile app (apps/mobile) — 1 день

1. Оновити NativeWind до сумісної версії
2. Перетворити `tailwind.config.js` (CJS) на новий формат
3. Перевірити що NativeWind preset правильно інтегрується з Tailwind 4
4. Тестувати на iOS simulator та Android emulator
5. Перевірити dark mode toggle

### Фаза 3: Design tokens пакет — ✅ done

1. ✅ **Зафіксовано: JS preset via `@config`.** CSS-first `@theme` дублювався б у Metro-конфізі для NativeWind, який досі на Tailwind 3. Один `packages/design-tokens/tailwind-preset.js` працює в обох runtime-ах. Рішення відображено у [`packages/design-tokens/README.md`](../../packages/design-tokens/README.md) і [`docs/design/module-accent.md`](../design/module-accent.md).
2. ✅ Оновлено документацію: `docs/design/module-accent.md` (3-layer-діаграма позначає loader per surface; v4-нотатка під Tailwind-API).
3. ✅ Перевірено що `brand`, `module-accent`, `status-*` кольори працюють — Phase 1 закрив це через Argos visual regression на web; mobile наслідує preset без змін, тож token-семантика збережена до моменту, коли Phase 2 розморозиться.

### Фаза 4: Cleanup — ✅ done

1. ✅ `autoprefixer` видалено з `apps/web/package.json` у [#1495](https://github.com/Skords-01/Sergeant/pull/1495); `knip.json` `apps/web` `ignoreDependencies` зачищено від нього.
2. ✅ `postcss-import` ніколи не був прямою залежністю — Tailwind 3 у нашому setup-і користувався вбудованим `postcss-import`-у `tailwindcss`-пакеті; pnpm-lock підтверджує відсутність явної залежності, тож видаляти нічого.
3. ✅ Додано [`apps/web/.browserslistrc`](../../apps/web/.browserslistrc) із Tailwind v4 baseline (Safari 16.4+, Chrome 111+, Firefox 128+, Edge 111+, плюс iOS 16.4+, Chrome Android 111+, Firefox Android 128+, Samsung 23+). Vite/esbuild target лишається у `vite.config.js` — browserslist документує CSS-support contract і живить майбутні tooling-консьюмери (`caniuse-lite`, `eslint-plugin-compat`).
4. ✅ CI проходить (Phase 1 PR закрив `pnpm lint && typecheck && test && build && size`). Поточний документ-оновлення не змінює рантайм — додавання `.browserslistrc` не консьюмиться жодним білд-степом.
5. ⏳ Переключення статусу на Completed — лишається відкритим: чекаємо закриття Phase 2 (NativeWind 5 / Tailwind 4 сумісність). Як тільки mobile піде на v4 — оновити `Status:` у шапці і прибрати «Phase 2 — blocked» рядок.

## Ризики

| Ризик                                         | Ймовірність | Вплив             | Митігація                                                                |
| --------------------------------------------- | ----------- | ----------------- | ------------------------------------------------------------------------ |
| NativeWind не підтримує Tailwind 4            | Середня     | Блокер для mobile | Мігрувати тільки web, mobile залишити на v3 поки NativeWind не оновиться |
| CSS variable alpha syntax ламається           | Низька      | Середній          | Automated upgrade tool повинен це обробити; ручна перевірка              |
| Visual regression через перейменовані утиліти | Середня     | Низький           | Argos порівняння до/після                                                |
| Design tokens preset несумісний               | Низька      | Високий           | Використати `@config` замість CSS-first для preset                       |

## Браузерна підтримка

Tailwind 4 підтримує:

- Safari 16.4+ (вийшов березень 2023)
- Chrome 111+ (вийшов березень 2023)
- Firefox 128+ (вийшов липень 2024)

Це підходить для Sergeant — персональний хаб не потребує підтримки старих браузерів.

## Корисні посилання

- [Official Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [Tailwind v4 Blog Post](https://tailwindcss.com/blog/tailwindcss-v4)
- [Tailwind v4 Browser Support / Compatibility](https://tailwindcss.com/docs/browser-support)
- [NativeWind Compatibility Tracker](https://github.com/nativewind/nativewind/issues) — слідкувати за v4 support
