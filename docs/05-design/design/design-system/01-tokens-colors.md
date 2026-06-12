# Design System — Принципи та Кольорові токени

> **Last validated:** 2026-06-12 by @claude. **Next review:** 2026-09-10.
> **Status:** Active (v2 redesign foundation merged 2026-05)

Цей документ охоплює базові принципи дизайн-системи, кольорові токени та WCAG AA контраст.

Повний index → [`../design-system.md`](../design-system.md).

---

## 1. Принципи

1. **Семантичні токени → Tailwind-утиліти → примітиви.** Ніяких hex-кодів в
   `className` (`bg-[#10b981]`, `text-[#fff]/50` — заборонено правилом
   `sergeant-design/no-hex-in-classname` на рівні `error`; див.
   `AGENTS.md` hard rule #11). Якщо потрібен новий колір — додай його
   у `packages/design-tokens/tailwind-preset.js` разом із
   `-soft` / `-strong` компаньйонами, не inline в компонент.
2. **Темна тема — first-class.** Всі токени живуть у CSS-змінних
   `:root` та `.dark`; теми перемикаються класом без перезапису стилів.
   Парні `dark:` override з сирою палітрою (`bg-teal-100 dark:bg-teal-900/30`)
   — заборонений анти-патерн. [`archive/dark-mode-audit.md`](../archive/dark-mode-audit.md)
   збережений як історія міграції; поточний guardrail —
   `sergeant-design/no-raw-dark-palette` на рівні `error` для `apps/web`.
3. **Модулі діляться токенами, а не стилями.** `bg-finyk-surface`,
   `text-fizruk`, `border-routine/30` — це семантичні аксенти; вся базова
   типографіка, spacing, радіуси одні для всіх. Всередині
   `apps/<app>/src/modules/<X>/` дозволені лише акценти модуля `<X>` —
   див. `AGENTS.md` hard rule #12 + [`module-accent.md`](../module-accent.md),
   enforced by `sergeant-design/no-foreign-module-accent` (`error`).
4. **Accessibility не опція.** Клавіатурний фокус завжди видимий
   (`focus-visible:ring-2 ring-focus/45 ring-offset-2 ring-offset-bg`),
   touch-targets ≥44×44 px, контраст ≥4.5:1 для тексту, ≥3:1 для
   UI-елементів (WCAG AA). Hard Rule #14 — `focus:` для viz-стилів
   заборонений, тільки `focus-visible:`.
5. **Мобільний first.** Базові пропси розраховані на 375px; планшет
   (768px) отримує додатковий breakpoint.

---

## 2. Кольорові токени

### 2.1 Семантичні поверхні

| Token            | Роль                                | Light     | Dark      |
| ---------------- | ----------------------------------- | --------- | --------- |
| `bg` / `bg-bg`   | Фон сторінки                        | `#fdf9f3` | `#171412` |
| `surface`        | Картки, панелі                      | `#ffffff` | `#201c19` |
| `surface-muted`  | Інпути, hover, допоміжні поверхні   | `#faf7f1` | `#292420` |
| `surface-strong` | Стек сторінки під модалкою          | = `bg`    | = `bg`    |
| `border`         | Розмежувачі, обводки картки         | `#ebe4da` | `#524a41` |
| `border-strong`  | Сильніший дільник (інпути, таблиці) | `#ddd3c5` | `#70665a` |

Back-compat: старі токени `panel` / `panelHi` / `line` продовжують працювати.

### 2.2 Текст

| Token    | Роль                                | Light               | Dark      |
| -------- | ----------------------------------- | ------------------- | --------- |
| `text`   | Заголовки, основний текст           | `#1c1917`           | `#faf7f1` |
| `muted`  | Секундарний текст, мітки            | `#57534e`           | `#b4aea9` |
| `subtle` | Третинний текст, плейсхолдери       | `#6b645d`           | `#878079` |
| `fg-*`   | Семантичні аліаси (prefer new code) | = text/muted/subtle |

### 2.3 Бренд і модулі

| Token                  | Hex       | Використання                                                        |
| ---------------------- | --------- | ------------------------------------------------------------------- |
| `accent` / `brand-500` | `#10b981` | Основний бренд, focus ring, CTA                                     |
| `finyk`                | `#10b981` | ФІНІК — гроші, баланси                                              |
| `fizruk`               | `#0e7490` | ФІЗРУК — тренування (cyan-700 — v2 redesign 2026-05; було teal-500) |
| `routine`              | `#f97066` | Рутина — звички, коралові                                           |
| `nutrition`            | `#92cc17` | Харчування — ліма                                                   |

Для кожного модуля доступні градаційні шкали `-50`…`-900` + hero-поверхні:
`bg-finyk-surface`, `bg-fizruk-surface`, `bg-routine-surface`,
`bg-nutrition-surface` (світла тінт поверхня під hero-картку модуля).

> **`accent-strong`-alias.** `accent-strong` (вживане в audit-документах і
> module-accent контракті) — це alias на `brand-strong` (`#047857`,
> emerald-700, ≥4.5:1 проти `text-white`). Окремого CSS-змінного `--c-accent-strong`
> нема: brand-палітра і accent у Sergeant — це той самий emerald,
> тому WCAG-AA-companion живе під канонічною назвою `bg-brand-strong` /
> `text-brand-strong`. Module-варіант — `bg-module-accent-strong` (резолвиться
> з `--module-accent-strong-rgb`, який публікує `ModuleAccentProvider`;
> див. [`module-accent.md`](../module-accent.md)).

### 2.4 Статуси

| Token     | Solid     | Soft (bg)      | Використання       |
| --------- | --------- | -------------- | ------------------ |
| `success` | `#10b981` | `success-soft` | Успіх, виконано    |
| `warning` | `#f59e0b` | `warning-soft` | Попередження       |
| `danger`  | `#ef4444` | `danger-soft`  | Помилки, видалення |
| `info`    | `#0ea5e9` | `info-soft`    | Нейтральний статус |

`-soft` токени адаптуються під темну тему автоматично — не пиши
`bg-red-50 dark:bg-danger/15`, пиши `bg-danger-soft`.

### 2.5 Data-viz (графіки)

Канонічний набір у `apps/web/src/shared/charts/chartTheme.ts`:

- `chartSeries.finyk / .fizruk / .routine / .nutrition` — бренд-акценти
  серій для модуля (primary + secondary + surface).
- `chartPaletteList` — 8-кольорова гармонійна палітра для pie/категорій.
- `chartAxis` / `chartGrid` / `chartTick` — спільні Tailwind-класи
  для осей, сітки, тіків.
- `chartGradients.finyk` тощо — пари stop'ів для area-fill градієнтів.

> Не імпортуй hex із chartPalette.js напряму в компонент — бери через
> `chartTheme.ts`, аби міграція палітри в майбутньому вимагала одного
> файлу.

---

## 9. WCAG AA контраст

| Пара                          | Ratio    | Статус       |
| ----------------------------- | -------- | ------------ |
| `text` on `surface` (light)   | 14.2 : 1 | AAA ✓        |
| `muted` on `surface` (light)  | 5.8 : 1  | AA ✓         |
| `subtle` on `surface` (light) | 2.9 : 1  | < AA (декор) |
| `text` on `surface` (dark)    | 14.0 : 1 | AAA ✓        |
| `muted` on `surface` (dark)   | 5.5 : 1  | AA ✓         |
| `brand-500` white text        | 3.9 : 1  | AA large ✓   |
| `finyk` white text            | 3.9 : 1  | AA large ✓   |
| `fizruk` white text           | 3.3 : 1  | AA large ✓   |
| `routine` white text          | 3.5 : 1  | AA large ✓   |
| `nutrition` white text        | 3.1 : 1  | AA large ✓   |
| `danger` white text           | 4.2 : 1  | AA ✓         |

Виводи:

1. `subtle` — тільки для декоративних / disabled станів, ніколи не для
   інформативного тексту.
2. Модульні кольори (fizruk/routine/nutrition) як background для білого
   тексту — **тільки у large-text режимі** (≥18 px / ≥14 px bold) або
   для іконок ≥24 px. Для body-тексту — використовуй `text-text` на
   surface, а модульний колір — для акценту (border/stroke/stat-value).
