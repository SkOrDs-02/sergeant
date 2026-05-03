# Міграція Tailwind CSS v3 → v4

> **Last validated:** 2026-05-03. **Next review:** 2026-08-01.
> **Status:** Planned — не розпочато.
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

### Фаза 1: Web app (apps/web) — 1 день

1. Створити фічер-бранч: `feat/tailwind-v4-web`
2. Запустити automated upgrade tool:
   ```bash
   cd apps/web
   npx @tailwindcss/upgrade
   ```
3. Перевірити зміни вручну:
   - `postcss.config.mjs` — `@tailwindcss/postcss` замість `tailwindcss` + `autoprefixer`
   - `index.css` — `@import "tailwindcss"` замість `@tailwind` директив
   - `tailwind.config.ts` — перевірити чи preset правильно імпортується
4. Оновити `packages/design-tokens/tailwind-preset.ts`:
   - Перевести `theme.extend` у `@theme` CSS синтаксис
   - Або зберегти JS config через `@config` директиву (простіше для shared preset)
5. Перевірити alpha-value синтаксис для CSS variable кольорів
6. Пройтися по всіх перейменованих утилітах (shadow, ring, rounded, border color)
7. Запустити: `pnpm dev:web` — візуально перевірити всі модулі
8. Запустити: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
9. Запустити Argos visual regression — порівняти скріншоти

### Фаза 2: Mobile app (apps/mobile) — 1 день

1. Оновити NativeWind до сумісної версії
2. Перетворити `tailwind.config.js` (CJS) на новий формат
3. Перевірити що NativeWind preset правильно інтегрується з Tailwind 4
4. Тестувати на iOS simulator та Android emulator
5. Перевірити dark mode toggle

### Фаза 3: Design tokens пакет — 0.5 дня

1. Вирішити: JS preset (`@config`) чи CSS-first (`@theme`)
   - **Рекомендація:** зберегти JS preset через `@config` — простіше підтримувати shared tokens між web і mobile
2. Оновити документацію: `docs/design/MODULE-ACCENT.md`
3. Перевірити що `brand`, `module-accent`, `status-*` кольори працюють

### Фаза 4: Cleanup — 0.5 дня

1. Видалити `autoprefixer` з `devDependencies`
2. Видалити `postcss-import` якщо є
3. Оновити `.browserslistrc` (Tailwind 4 підтримує Safari 16.4+, Chrome 111+, Firefox 128+)
4. Оновити CI: перевірити що build/test проходять
5. Оновити цей документ: статус → Completed

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
- [Tailwind v4 Breaking Changes](https://mintlify.com/tailwindlabs/tailwindcss/upgrading/v3-to-v4)
- [NativeWind Compatibility Tracker](https://github.com/nativewind/nativewind/issues) — слідкувати за v4 support
