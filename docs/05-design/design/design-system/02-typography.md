# Design System — Типографічна шкала

> **Last validated:** 2026-06-12 by @claude. **Next review:** 2026-09-10.
> **Status:** Active (v2 redesign foundation merged 2026-05)

Цей документ охоплює типографічну шкалу, семантичні утиліти та правила ієрархії тексту.

Повний index → [`../design-system.md`](../design-system.md).

---

## 3. Типографічна шкала

### Семантичні `.text-style-*` ютиліті (tier-1, fluid)

Дванадцять канонічних слотів — це **єдине правильне джерело істини**
для типографіки. Кожна утиліта зашиває `font-size` (fluid через
`clamp()`), `line-height`, `font-weight`, `letter-spacing` та casing
як один атомарний контракт. Розміри плавно зростають від 320 px до
1280 px вьюпорту — без media-query-стрибків, без drift-у між кейсами.

**Hard Rule #16 — 12px floor.** Жоден семантичний слот не опускається
нижче 12px (caption / overline). `text-2xs` (10px) лишається для
chart axis-ticks і декоративних бейджів — це не `text-style-*` слот.

Реєстр живе у [`packages/design-tokens/tailwind-preset.js`](../../../../packages/design-tokens/tailwind-preset.js)
→ `plugins.semanticTypography`. Lint `sergeant-design/prefer-text-style`
заохочує семантичні утиліти замість ручних `text-* font-* tracking-*`
комбо; `sergeant-design/no-arbitrary-text-size` забороняє
`text-[Npx]` / `text-[Nrem]`.

| Утиліта                | Розмір (clamp)    | Lh   | Weight | Tracking | Роль                                   |
| ---------------------- | ----------------- | ---- | ------ | -------- | -------------------------------------- |
| `.text-style-display`  | 32 → 56 px        | 1.05 | 700    | -0.025em | Landing hero / splash heading          |
| `.text-style-headline` | 26 → 36 px        | 1.15 | 700    | -0.02em  | Page H1, hero stat number              |
| `.text-style-title-lg` | 22 → 28 px        | 1.25 | 600    | -0.015em | Велике секційне заголовкове            |
| `.text-style-title`    | 18 → 22 px        | 1.3  | 600    | -0.01em  | Section heading, card title            |
| `.text-style-subtitle` | 16 → 18 px        | 1.4  | 500    | -0.005em | Sub-heading                            |
| `.text-style-body-lg`  | 16 → 18 px        | 1.55 | 400    | 0        | Acцентований body (intro, lead-абзаци) |
| `.text-style-body`     | 15 → 16 px        | 1.55 | 400    | 0        | Дефолтний body                         |
| `.text-style-body-sm`  | 13 → 14 px        | 1.55 | 400    | 0        | Secondary body, descriptions           |
| `.text-style-label`    | 13 → 14 px        | 1.4  | 500    | 0.005em  | Form label, button text                |
| `.text-style-caption`  | **12 px** (floor) | 1.4  | 400    | 0.005em  | Helper text, metadata, timestamps      |
| `.text-style-overline` | **12 px** (floor) | 1.4  | 600    | 0.08em   | UPPER section kicker / eyebrow         |
| `.text-style-code`     | 13 → 14 px / mono | 1.5  | 500    | 0        | Inline `code`, monospace stats         |

**Back-compat.** `.text-style-hero` лишається аліасом на `headline`
(той самий fluid контракт) — існуючі call-site-и не вимагають міграції.
Нове code-author writes `.text-style-headline` напряму.

### Line-height & letter-spacing — за роллю, а не за розміром

- **Display / headline** — `line-height: 1.05–1.15`, негативний
  `letter-spacing` (≈ -0.02em). Великі літери "слипаються" і
  виглядають композиційніше.
- **Title / title-lg** — `line-height: 1.25–1.3`, легке негативне
  трекінг (-0.01em / -0.015em).
- **Body / body-lg / body-sm** — `line-height: 1.55` (loose),
  трекінг 0. Це найважливіше — body для довгого читання має
  «дихати», навіть на mobile.
- **Label / caption** — `line-height: 1.4`, мінімальний позитивний
  трекінг (0.005em) для читабельності на дрібних розмірах.
- **Overline** — `line-height: 1.4`, **великий all-caps трекінг
  0.08em** (стандарт для capslock-кікерів — без трекінгу
  капітал-літери виглядають перевантажено).
- **Code** — `line-height: 1.5`, monospace.

### Font-feature defaults

На рівні `html` глобально вмикаються OpenType-фічі:

```css
font-feature-settings:
  "kern" 1,
  /* кернінг          */ "liga" 1,
  /* common ligatures */ "calt" 1,
  /* contextual alts  */ "ss01" 1; /* DM Sans stylistic set 01 */
font-kerning: normal;
text-rendering: optimizeLegibility;
```

Це підв'язує всі екрани до однакових базових гліфів. Якщо потрібно
відключити для специфічного блоку (наприклад, ASCII-арт або суворо
літеральні гліфи) — `font-feature-settings: normal` на елементі.

### Tabular nums — `.tnum`

Числові колонки (таблиці, статистики, hero-цифри) **обов'язково**
вмикають `font-variant-numeric: tabular-nums` — інакше пропорційний
шрифт стрибає на ±2 px у пропорційних 5/6/7. Утиліта:

```html
<td class="tnum text-right">12 400</td>
```

`.tnum` живе в `tailwind-preset.js` поряд з `.text-style-*`.
Старий `.tabular-nums` (визначений у `apps/web/src/styles/base.css`)
лишається back-compat-аліасом.

### Канонічна `.text-*` шкала (tier-2 — окремі утиліти)

Поряд з `text-style-*` живе ще один шар — окремі семантичні утиліти, які
закривають дрібніші, нижчі та більші розміри, що не мають своєї
семантичної ролі в `text-style-*`. Усі вони визначені в
`apps/web/src/styles/utilities.css`:

| Утиліта              | Контракт                                   | Коли використовувати                                                                                                             |
| -------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `.text-display`      | 36 / none / 700 / tabular / -tracking      | Hero stat (₴ 12 400)                                                                                                             |
| `.text-display-stat` | **40** / tight / 700 / tabular / -tracking | Найбільша цифра на екрані (HeroCard сума, AssetsTable)                                                                           |
| `.text-display-hero` | **44** / none / 900 / tabular / -tracking  | Story / digest "celebration"-цифра (kcal, спалена сума)                                                                          |
| `.text-h1`           | 24 / tight / 700 / -tracking               | Page / screen title                                                                                                              |
| `.text-h2`           | 18 / snug / 600 / -0.01em                  | Section heading                                                                                                                  |
| `.text-h3`           | 15 / snug / 600                            | Card title, subsection label                                                                                                     |
| `.text-body`         | 15 / relaxed / 400                         | Default prose                                                                                                                    |
| `.text-body-sm`      | 13 / relaxed / 400                         | Secondary text, descriptions                                                                                                     |
| `.text-caption`      | 12 / snug / 400 / 0.01em                   | Labels, timestamps, meta copy                                                                                                    |
| `.text-eyebrow`      | 11 / none / 600 / 0.08em / UPPER           | Overline / section prefix ("ФІНІК", "СЬОГОДНІ")                                                                                  |
| `.text-meta`         | **11** / snug / 500                        | Compact lowercase labels (KPI hints, "Monobank", "USD")                                                                          |
| `.text-micro`        | **10** / tight / 500                       | Aux glyph labels (icon-overlay numbers, ring centre, axis ticks). **Floor — нижче не використовувати, навіть на світлих фонах.** |

Вага:

- `font-medium` (500) — секундарний акцент
- `font-semibold` (600) — дефолт заголовків
- `font-bold` (700) — hero, promo, large stat values
- `font-black` (900) — лише для великих цифр / промо

Числа завжди з `tabular-nums` у таблицях / статистиках.

### Заборонено: arbitrary `text-[Npx]` / `text-[Nrem]`

Ad-hoc `text-[12px]` / `text-[40px]` / `text-[2.5rem]` обходять і tier-1
(`text-style-*`), і tier-2 (`text-display`/`text-h*`/`text-meta`/...) —
це призводить до vertical-rhythm-дрифту і регресій типу 8 px підпису
поверх coral-фону (нижче WCAG-комфорту). Лінт правило
[`sergeant-design/no-arbitrary-text-size`](../../../../packages/eslint-plugin-sergeant-design/README.md#sergeant-designno-arbitrary-text-size)
ловить будь-яке `text-[N(px|rem|em)]` як `error`.

DS-примітиви, які власне визначають raw-px-токени (`Button`, `Input`,
`Badge`, `Stat`, `SectionHeading`, `Label`, `Toast`, `Skeleton`, `Tabs`,
`Segmented`, `Card`), звільнено від правила, бо вони — джерело істини
для самих утиліт.

### Prose — `@shared/components/ui/Prose`

Для довгого rich-text-у (онбординг кроки, статті у Coach, markdown
з асистента, документація-в-екрані) використовуй компонент `Prose`.
Він застосовує семантичну шкалу до всіх дочірніх HTML-тегів
(h1..h4, p, ul, ol, li, blockquote, code, pre, hr, a, table),
тримає вимірення (`measure`) у комфортних ≤70ch через токен
`--max-line-length` і має два варіанти:

| Variant   | Base    | Spacing rhythm | Коли використовувати                                   |
| --------- | ------- | -------------- | ------------------------------------------------------ |
| `default` | body    | 1.0× (relaxed) | Статті, довгі описи, articles, blog-style preview      |
| `compact` | body-sm | 0.6× (tight)   | Шіти, сайдбари, in-card prose, дрібні onboarding-блоки |

```tsx
import { Prose } from "@shared/components/ui";

<Prose>
  <h2>Заголовок</h2>
  <p>Абзац з <a href="#">посиланням</a> і <code>inline-кодом</code>.</p>
  <ul><li>Bullet</li></ul>
</Prose>

<Prose variant="compact">…</Prose>
```

Перевизначити кеп рядка можна локально через CSS-змінну:

```tsx
<Prose style={{ "--max-line-length": "60ch" } as React.CSSProperties}>…</Prose>
```

### Do / Don't — гайдлайни ієрархії

- ✅ **Do** — використовуй один `display` або `headline` на екран.
  Hero — це фокусна точка; два хедлайни змагаються між собою.
- ✅ **Do** — body / body-lg для абзаців; body-sm — лише для
  допоміжного підпису під полем або secondary description.
- ✅ **Do** — overline (UPPER + 0.08em tracking) як кікер, не як body.
- ❌ **Don't** — не пар `text-style-display` з `text-style-body-sm`
  в одному hero. Дисплейний розмір потребує body-lg як супутника
  (контраст у вазі і ритмі).
- ❌ **Don't** — не дублюй `text-style-title` всередині `Prose` —
  `<h3>` всередині блоку вже отримує `title-lg` автоматично.
- ❌ **Don't** — `text-2xs` (10 px) — це не "тиха caption". Це чарт-axis
  або декоративний бейдж. Для будь-якого тексту, який користувач
  має прочитати, щоб діяти — мінімум `caption` (12 px).
- ❌ **Don't** — не комбінуй `text-style-overline` з body-розмірним
  фоном (наприклад, на `bg-finyk-soft` з 12 px без weight 600 текст
  «втопиться» — overline передбачає контрастний weight + tracking).
