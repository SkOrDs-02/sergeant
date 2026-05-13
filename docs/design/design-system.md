# Sergeant Design System

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-11.
> **Status:** Active

Єдина візуальна мова для хаба з 4 модулями: **ФІНІК**, **ФІЗРУК**, **Рутина**,
**Харчування**. Документ — контракт між дизайном і кодом; будь-який новий
екран має користуватися цим набором токенів і примітивів.

> **TL;DR для контриб'ютора.** Якщо ти пишеш новий екран — імпорти все з
> `@shared/components/ui` і використовуй семантичні класи Tailwind
> (`bg-surface`, `text-fg`, `border-border`). Ніколи не додавай hex-коди в
> `className`, не створюй «ще одну кастомну картку», і не пиши
> `text-gray-500` / `bg-white`.

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
   — заборонений анти-патерн. [`dark-mode-audit.md`](./dark-mode-audit.md)
   збережений як історія міграції; поточний guardrail —
   `sergeant-design/no-raw-dark-palette` на рівні `error` для `apps/web`.
3. **Модулі діляться токенами, а не стилями.** `bg-finyk-surface`,
   `text-fizruk`, `border-routine/30` — це семантичні аксенти; вся базова
   типографіка, spacing, радіуси одні для всіх. Всередині
   `apps/<app>/src/modules/<X>/` дозволені лише акценти модуля `<X>` —
   див. `AGENTS.md` hard rule #12 + [`module-accent.md`](./module-accent.md),
   enforced by `sergeant-design/no-foreign-module-accent` (`error`).
4. **Accessibility не опція.** Клавіатурний фокус завжди видимий
   (`focus-visible:ring-2 ring-brand-500/45`), touch-targets ≥44×44 px,
   контраст ≥4.5:1 для тексту, ≥3:1 для UI-елементів (WCAG AA).
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

| Token                  | Hex       | Використання                    |
| ---------------------- | --------- | ------------------------------- |
| `accent` / `brand-500` | `#10b981` | Основний бренд, focus ring, CTA |
| `finyk`                | `#10b981` | ФІНІК — гроші, баланси          |
| `fizruk`               | `#14b8a6` | ФІЗРУК — тренування             |
| `routine`              | `#f97066` | Рутина — звички, коралові       |
| `nutrition`            | `#92cc17` | Харчування — ліма               |

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
> див. [`module-accent.md`](./module-accent.md)).

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

Реєстр живе у [`packages/design-tokens/tailwind-preset.js`](../../packages/design-tokens/tailwind-preset.js)
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
[`sergeant-design/no-arbitrary-text-size`](../../packages/eslint-plugin-sergeant-design/README.md#sergeant-designno-arbitrary-text-size)
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

---

## 4. Spacing, радіуси, тіні

### Spacing scale

Tailwind `spacing` (базова шкала 4px) + кастомні:
`p-4.5` (18px), `h-13` (52px), `h-15` (60px), `h-18` (72px), `h-22` (88px).
Гайдлайн: padding карток ≥16px (`p-4`), гутер між картками ≥12px
(`gap-3`), в hero — `p-6`.

### Радіуси

| Клас           | Значення | Використання                   |
| -------------- | -------- | ------------------------------ |
| `rounded-md`   | 6 px     | Дрібні бейджі, pill            |
| `rounded-lg`   | 8 px     | Маленькі кнопки `xs`           |
| `rounded-xl`   | 12 px    | Кнопки, інпути `sm`            |
| `rounded-2xl`  | 16 px    | Інпути `md/lg`, картки дефолт  |
| `rounded-3xl`  | 24 px    | Картки hero, панелі модулів    |
| `rounded-4xl`  | 32 px    | Великі модалки, bottom-sheets  |
| `rounded-full` | —        | Кружечки, pill-бейджі, аватари |

Правило: **одна картка — один радіус**. Не змішуй `rounded-xl`
header + `rounded-2xl` body.

### Тіні (елеваційна шкала e0..e5)

Семантична шкала єдине джерело правди для глибини. Розподіл рівнів —
в [`packages/design-tokens/tokens.js`](../../packages/design-tokens/tokens.js) →
`elevation`; CSS-змінні лежать в
[`apps/web/src/styles/theme.css`](../../apps/web/src/styles/theme.css)
і автоматично перемикаються в `.dark` — ніяких `dark:shadow-*`
(Hard Rule #13).

| Клас        | Рівень      | Коли                                     | Z-tier       |
| ----------- | ----------- | ---------------------------------------- | ------------ |
| `shadow-e0` | Flat        | Фон сторінки, секції, інпути             | `z-base`     |
| `shadow-e1` | Raised      | Дефолт `Card`, рядки списку, панелі      | `z-base`     |
| `shadow-e2` | Interactive | Hover підйом карток / pressables         | `z-base`     |
| `shadow-e3` | Overlay     | Popover, dropdown, tooltip, menu         | `z-dropdown` |
| `shadow-e4` | Modal       | `<Modal>`, `<Sheet>`, drawer             | `z-modal`    |
| `shadow-e5` | Toast       | `<Toast>`, snackbar (top-most ephemeral) | `z-toast`    |

Парний z-index тір (`zTier` в токенах):

| Семантика  | Клас         | Значення | Призначення                               |
| ---------- | ------------ | -------- | ----------------------------------------- |
| `base`     | `z-base`     | `0`      | Контент сторінки, картки, кнопки (e0..e2) |
| `dropdown` | `z-dropdown` | `50`     | Попапи, меню, tooltip (e3)                |
| `sticky`   | `z-sticky`   | `100`    | Sticky header / toolbar                   |
| `overlay`  | `z-overlay`  | `150`    | Non-modal overlays, scrim під модалкою    |
| `modal`    | `z-modal`    | `200`    | Modal, Sheet, drawer (e4)                 |
| `toast`    | `z-toast`    | `300`    | Toast, snackbar (e5)                      |

Правило: **рівень елевації рухається в парі з z-tier**. Якщо піднімаєш
shadow до e4 — бери `z-modal`. Їх розсинхронізація = popover під модалкою
або toast під drawer-ом.

#### ДО ї НЕ ТРЕБА

**ДО** — вибирай найменший рівень, який передає роль елемента. Дефолтний Card — e1.

```tsx
<Card prominence="interactive">  {/* shadow-e1, hover → shadow-e2 */}
  <Stat label="Баланс" value="₴12 345" />
</Card>

<Modal>                            {/* shadow-e4 + z-modal */}
  <CelebrationCopy />
</Modal>

<Toast>                            {/* shadow-e5 + z-toast */}
  Запис збережено.
</Toast>
```

**НЕ ТРЕБА** — не додавай `dark:shadow-*`, не копіюй raw `boxShadow` в inline-style,
не бери `shadow-e4` для плоскої картки "щоб було popping". Що більший рівень —
тим вище має бути z-tier.

```tsx
/* ⛔ НЕ ТРЕБА — вибиває візуальну ієрархію */
<Card className="shadow-e4" />                          /* картка не має важити як Modal */
<div className="shadow-card dark:shadow-2xl" />         /* парні dark: — Hard Rule #13 */
<div className="shadow-e3 z-toast" />                   /* попап на toast тірі — розсинхрон з e3 */
```

#### Legacy aliases

Наявні класи `shadow-soft / shadow-card / shadow-float / shadow-glow` продовжують
працювати — вони внутрішньо мапляться на нову шкалу (`card → e1`,
`float → e3`, `soft → e4`). Новий код має вживати явний `shadow-eN`.

---

## 5. Примітиви UI

Імпорт:

```ts
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  FormField,
  IconButton,
  Icon,
  Input,
  SectionHeader,
  Segmented,
  Select,
  Skeleton,
  Spinner,
  Stat,
  Tabs,
  Textarea,
} from "@shared/components/ui";
```

### Button

Базовий контракт для всіх кнопок.

- **Variants**: `primary` · `secondary` · `ghost` · `danger` · `success`
  - модульні (`finyk` / `fizruk` / `routine` / `nutrition` з soft-версіями).
- **Sizes**: `xs` (h-8) · `sm` (h-9) · `md` (h-11) · `lg` (h-12) · `xl` (h-14).
  Усі `md+` задовольняють touch-target 44×44.
- **States**:
  - `loading` — автоматично додає `Spinner`, ставить `aria-busy`.
  - `disabled` — `opacity-50 cursor-not-allowed`, блокує pointer-events.
  - `focus-visible` — `ring-2 ring-brand-500/45 ring-offset-2`.
  - `active:scale-[0.98]` для press feedback.
- **`iconOnly`** — прибирає px-padding і робить квадратну геометрію.
  Альтернатива: `IconButton` (див. нижче).

### IconButton

Обгортка над `Button` з `iconOnly` і **обов'язковим** `aria-label`.

```tsx
<IconButton aria-label="Відкрити меню" variant="ghost" onClick={openMenu}>
  <Icon name="menu" />
</IconButton>
```

Не використовуй голий `<button>` для іконок — порушиш focus-contract.

### Card

`Card` має дві ортогональні осі рішень:

1. **Identity** (`module?: 'finyk'|'fizruk'|'routine'|'nutrition'`) — чи
   ця картка брендована для конкретного модуля.
2. **Prominence** (`prominence?`) — наскільки голосно картка має звучати
   на сторінці:
   - `hero` — повний насичений brand surface (`bg-hero-{module}` у світлій,
     `bg-{module}-soft` у темній). Для module dashboard hero / first
     screen.
   - `soft` — module surface на панелі, без `/50`-washout. Підкартки
     всередині module screen.
   - `tinted` — нейтральна panel + module-tinted hairline. Найтихіше
     module identity — модуль належить, але контент важливіший.
   - `flat` / `elevated` / `interactive` / `ghost` / `default` — neutral
     surfaces без module-tint (працюють і самі, і в парі з `module` для
     module-tinted hairline).

- **Radius** (`radius?: 'md'|'lg'|'xl'`) — дефолт `xl` (rounded-3xl);
  для legacy-варіантів `*-soft` зберігається історичний дефолт `lg`
  (rounded-2xl) щоб не ламати call-сайти. **Radius проп завжди виграє** —
  попередній footgun «module-варіанти мовчки запікали `rounded-3xl`»
  закритий.
- **Dark-mode parity**: module surfaces резолвлять tint через
  `--c-{module}-soft*` з `apps/web/src/index.css`. У світлій темі це
  `-50/-200`-сім'я; у темній — `-900/-800`. Module identity лишається
  присутньою через перемикання теми — light-картки більше не колапсують
  у нейтральний panel у dark.
- **Padding**: `none` / `sm` / `md` / `lg` / `xl`.
- **Subcomponents**: `CardHeader`, `CardTitle`, `CardDescription`,
  `CardContent`, `CardFooter`. Використовуй їх замість ручного
  `<div className="p-4 flex items-center justify-between">`.
- **Legacy `variant` prop**: рядкова union (`default` / `interactive` /
  `flat` / `elevated` / `ghost` / `finyk` / `finyk-soft` / …) лишається
  робочою — module-стрічки внутрішньо мапляться у `(module, prominence)`.
  У новому коді **обирай orthogonal API**.

```tsx
// Нова форма (preferred)
<Card module="finyk" prominence="hero" radius="xl">…</Card>
<Card module="finyk" prominence="soft" radius="lg">…</Card>
<Card module="nutrition" prominence="tinted">…</Card>

// Legacy (досі працює)
<Card variant="finyk-soft">…</Card>
```

### Input / Textarea / Select

- **Sizes**: `sm` (h-9) · `md` (h-11) · `lg` (h-12).
- **Variants**: `default` · `filled` · `ghost`.
- **States**: `error` (з `aria-invalid`), `success`, `disabled`.
- Focus — `focus-visible:ring-brand-500/30`, а не `focus:`, аби
  pointer-клік не блимав кільцем.

### Badge

- **Variants**: `neutral` · `accent` · `success` · `warning` · `danger` ·
  `info` + модульні.
- **Tones**: `soft` (фон + колір + border) · `solid` (фільд) · `outline`.
- **Sizes**: `xs` / `sm` / `md`. Опційно `dot` (кольорова крапка-статус).

### Stat

Пара «мітка + значення» з опційним субтитром та іконкою.

- **Tones**: `default` · `success` · `warning` · `danger` + модульні.
- **Sizes**: `sm` · `md` · `lg`.
- Вирівнювання: `left` / `center` / `right`.
- Цифри автоматично отримують `tabular-nums`.

### Tabs / Segmented

- `Tabs` — верхній роутер секцій. Tones: `underline` (мінімал) / `pill`
  (м'який таб). Акценти підхоплюються з модуля (`brand`/`finyk`/…).
- `Segmented` — перемикач з 2-4 опціями (напр. період «день/тиждень/місяць»).

Обидва примітиви мають повну клавіатурну навігацію: ArrowLeft/Right,
Home/End, `role="tablist"`.

### SectionHeader

Єдиний стиль для eyebrow-лейблів («ПРОГРЕС», «ВИТРАТИ»). Замінює
розкидані `text-2xs font-bold text-subtle uppercase tracking-widest`.

```tsx
<SectionHeader size="xs" action={<Button size="xs">Всі</Button>}>
  Нещодавні витрати
</SectionHeader>
```

**Розмір (`size`) vs колір (`variant`)** — окремі осі:

| size | type-scale                                     | коли                    |
| ---- | ---------------------------------------------- | ----------------------- |
| `xs` | `text-xs  font-bold uppercase tracking-wider`  | compact in-card eyebrow |
| `sm` | `text-xs  font-bold uppercase tracking-widest` | standard section title  |
| `md` | `text-sm font-semibold`                        | inline group heading    |
| `lg` | `text-lg font-extrabold leading-tight`         | page sub-section        |
| `xl` | `text-xl font-extrabold leading-tight`         | page/route title        |

| variant     | клас                                           | коли                                  |
| ----------- | ---------------------------------------------- | ------------------------------------- |
| `subtle` \* | `text-subtle`                                  | eyebrow по замовчуванню для `xs`/`sm` |
| `muted`     | `text-muted`                                   | послаблений підпис                    |
| `text` \*   | `text-text`                                    | за замовчуванням для `md`/`lg`/`xl`   |
| `accent`    | `text-accent`                                  | глобальний фокус/лінк (emerald)       |
| `finyk`     | `text-finyk-strong dark:text-finyk/70`         | brand-tint у модулі ФІНІК             |
| `fizruk`    | `text-fizruk-strong dark:text-fizruk/70`       | brand-tint у модулі ФІЗРУК            |
| `routine`   | `text-routine-strong dark:text-routine/70`     | brand-tint у модулі Рутина            |
| `nutrition` | `text-nutrition-strong dark:text-nutrition/70` | brand-tint у модулі Харчування        |

Зірочкою (\*) — це значення за замовчуванням; їх можна не передавати.

**Branded eyebrow** (напр. KJВЖ-картки в Харчуванні):

```tsx
<SectionHeading as="div" size="xs" variant="nutrition">
  Білки
</SectionHeading>
```

Перед `tone` уникай `text-nutrition/70` / `text-nutrition/80` /
`text-nutrition/90` драфту — усі branded eyebrow'и нормалізовані до
`/70`.

### Tooltip

Доступний замінник native `title="..."` (який не читається скрін-рідерами і
не дотискається з клавіатури). Хінт для контролів, у яких іконка/коротка
лейба не дає повного контексту: «зберегти», «синхронізувати»,
«дізнатися більше».

```tsx
import { Tooltip } from "@shared/components/ui";

<Tooltip content="Зберегти зміни (Ctrl+S)" placement="top">
  <Button variant="primary" iconOnly aria-label="Зберегти">
    <Icon name="save" />
  </Button>
</Tooltip>;
```

**Контракт:**

- **Тригер** — рівно один React-елемент. Має форвардити
  `onMouseEnter` / `onMouseLeave` / `onFocus` / `onBlur` /
  `aria-describedby` (Sergeant `Button` / `IconButton` / `Badge` — ок).
- **Розкривається** на `mouseenter` АБО `focus-visible` після
  `openDelay` (typ. 150 мс).
- **Закривається** на `mouseleave` / `focusout` / `Escape` / outside-click.
- **`role="tooltip"`** на панелі, `aria-describedby` — на тригері (автоматично).
- **`size`** — `sm` (дефолт, compact caption) або `md` (multi-line copy).
- **`placement`** — 12-точкова решітка:
  `top|right|bottom|left` + `*-start|*-end`. Legacy-аліаси
  (`top-center`, …) теж приймаються — нормалізуються всередині.
- **Portaled to `document.body`** — панель не клипається transformed /
  `overflow: hidden`-ancestor-ами (containing-block-фікс; той самий мотив, що
  в Modal — PR #2227).
- **`motion-safe:animate-fade-in`** — реагує на `prefers-reduced-motion: reduce`.
- **Toggle off:** `disabled` — тригер далі рендериться, але tooltip
  ніколи не з'являється.

**Do:**

- Використовуй для icon-only кнопок без візуальної лейби.
- Тримай copy ≤ 1–2 рядки в `sm`; для довшого пояснення — `size="md"`.

**Don't:**

- Не клади інтерактивний контент (кнопки, лінки) у tooltip — це не
  модал. Для інтерактиву потрібен `Popover`.
- Не дублюй native `title="..."` — призводить до подвійних спливаючих хінтів.
- Не привʼязуй критично-важливу інфу лише до tooltip — користувачі
  на тач-пристроях можуть не побачити hover-стан.

### Popover

Click-driven floating-surface для меню, фільтрів, info-карток і форм-у-
попапі. На мобільному (< md) — використовуй `Sheet` замість Popover-а.

```tsx
import { Popover, PopoverItem, PopoverDivider } from "@shared/components/ui";

// Меню дій
<Popover trigger={<Button>Опції</Button>}>
  <PopoverItem onClick={onEdit}>Редагувати</PopoverItem>
  <PopoverDivider />
  <PopoverItem destructive onClick={onDelete}>
    Видалити
  </PopoverItem>
</Popover>;

// Форма-в-попапі — header + body + footer слоти
<Popover
  trigger={<Button>Фільтри</Button>}
  header="Фільтри транзакцій"
  footer={<ActionButtons />}
>
  <FilterForm />
</Popover>;
```

**Контракт:**

- **Click-toggle** на тригер; ESC + outside-click + Tab-trap, коли відкритий.
  Focus повертається на тригер при закритті (`useDialogFocusTrap`).
- **ARIA**: `aria-haspopup="true"`, `aria-expanded`, `aria-controls` на
  тригер-обгортці; коли передаєш `header` — додатково `aria-labelledby`
  на панель + автоматичний `role="dialog"` (інакше `role="menu"` для
  класичних item-меню).
- **Portaled to `document.body`** — той самий containing-block-фікс, що й
  у Tooltip / Modal.
- **`placement`** — та сама 12-точкова решітка (`top|right|bottom|left`
  - `*-start|*-end`). Дефолт — `bottom-start`.
- **Слоти**: `header` (string | JSX) і `footer` (JSX) додають візуальні
  розділювачі + padding; без них panel — компактна menu-смуга з `py-1.5`.
- **Sub-components**: `PopoverItem` (`role="menuitem"` + arrow-нав з parent)
  і `PopoverDivider` (`<hr>`).
- **Controlled mode**: `open` + `onOpenChange` (як на формі-в-попапі, де
  треба «Apply → закрити»).
- **`motion-safe:animate-fade-in`** на панелі.

**Keyboard:**

| Клавіша           | Дія                                                       |
| ----------------- | --------------------------------------------------------- |
| `Enter` / `Space` | Toggle на тригері                                         |
| `Tab`             | Cycle всередині панелі (focus-trap)                       |
| `ArrowDown / Up`  | Roving focus між `PopoverItem`-ами (тільки `role="menu"`) |
| `Home / End`      | Перший / останній item у menu-режимі                      |
| `Escape`          | Закрити панель + повернути фокус на тригер                |

**Do:**

- Використовуй для меню дій з 3-7 опцій, info-карток, фільтрів і легких
  форм (1-3 поля).
- Для меню — `PopoverItem` + `PopoverDivider` (підхоплять стрілкову
  навігацію + `role="menuitem"`).
- Для info-card / form — `header` / `footer` слоти; роль панелі автоматично
  перейде у `"dialog"`.

**Don't:**

- Не клади важкі форми (> 4-5 полів) — це Sheet/Modal.
- Не вкладай `Popover` всередину `Popover` без сильного юзкейса — кілька
  трапів конфліктують.
- Не запихай destructive multi-step дії — попап може закритися outside-click-ом
  до підтвердження. Для destructive → `ConfirmDialog`.

### EmptyState

- `icon` · `title` · `description` · `action`.
- `compact` режим для in-card плейсхолдерів.
- Використовуй для всіх «немає да��их» станів — не роби ad-hoc.

### Spinner

Канонічний індикатор завантаження (4 розміри). Використовується всередині
`Button loading`, інлайн-фетчі, skeleton overlay.

### Switch

Token-styled iOS-style pill-тогл. `<button role="switch">` з повним
WAI-ARIA-контрактом: `aria-checked` відбиває стан, `aria-labelledby` /
`aria-describedby` відсилають на видиму мітку та опис,
`focus-visible:ring-2 ring-brand-500/45` (Hard Rule #14).

- **Sizes**: `sm` 36×20 · `md` 44×26 (дефолт — мінімум-touch-target).
- **States**: `disabled`, `error` (додає `aria-invalid` + danger ring).
- **Controlled**: `checked` + `onChange`. **Uncontrolled**: `defaultChecked`.
- **Keyboard**: Space / Enter (native button), додатково ArrowLeft / ArrowRight
  за патерном WAI-ARIA Switch.
- **A11y**: зміна стану викликає `hapticTap()` + screen-reader announce
  `{label} увімкнено / вимкнено` (override через `announceText`).

```tsx
<Switch
  size="md"
  checked={pushOn}
  onChange={setPushOn}
  label="Push-сповіщення"
  description="Надсилати нагадування про звички"
/>
```

### Slider

Token-styled слайдер з власними тумбами `role="slider"`. Підтримує
single-значення та range (дві тумби), тіки, валю-tooltip при drag/focus,
вертикальну орієнтацію (опційно).

- **Sizes**: `sm` (трек 4 px) · `md` (6 px).
- **Orientation**: `horizontal` (дефолт) / `vertical` (знизу вгору).
- **Keyboard** (кожна тумба):
  - `→` / `↑` — +1 step, `←` / `↓` — −1 step
  - `Shift` + арров — ×10 step
  - `PageUp` / `PageDown` — ±10 % діапазону
  - `Home` / `End` — min / max
- **Range**: дві тумби; значення не можуть перехрещуватися (вбудований
  clamp).
- **Drag**: pointer capture на track — працює з мишею/тачем/stylus.
- **A11y**: `aria-valuemin/max/now`, `aria-valuetext`, `aria-orientation`,
  звуження range через динамічний `aria-valuemax`/`aria-valuemin` на
  сусідній тумбі.

```tsx
<Slider
  aria-label="Гучність"
  value={volume}
  onChange={setVolume}
  ticks={[0, 25, 50, 75, 100]}
  showTooltip
  formatValue={(n) => `${n}%`}
/>
```

### ProgressBar

Лінійний індикатор прогресу. Determinate та indeterminate. Цвітові
філли — `*-strong` компаньйони (Hard Rule #9) для білого внутрішнього
тексту.

- **Sizes**: `xs` 2 px · `sm` 6 px · `md` 8 px · `lg` 12 px (h-1/1.5/2/3).
- **Variants**: `brand` / `success` / `warning` / `danger`.
- **Indeterminate**: обмежений бар летає треком (1.4 s loop). Під
  `prefers-reduced-motion: reduce` фол-бек на повноширокий
  `pulse-soft` (WCAG 2.3.3).
- **A11y**: `role="progressbar"` + `aria-valuenow/max/min`, `aria-busy`
  коли indeterminate. Опційний inner-label (`labelPlacement="inside"`) або
  outside.

```tsx
<ProgressBar value={65} size="lg" variant="success" label="65%" />
<ProgressBar indeterminate aria-label="Синхронізація" />
```

### ProgressCircle

Радіальний індикатор з тими ж статус-варіантами. Determinate —
stroke-dasharray; indeterminate — чверть-дуга, яка обертається.

- **Sizes**: `xs` 28 / `sm` 44 / `md` 64 / `lg` 96 px.
- **Variants**: `brand` / `success` / `warning` / `danger` — stroke з
  `text-{c}-strong` (AA на кремі).
- Під reduced-motion — обертання вимикається, натомість `pulse-soft`.
- `ProgressCircle` — коли потрібно progress-примітив без module-tint.
  Для KPI-тайлів (`finyk` / `fizruk` / `routine` / `nutrition` акценти) —
  продовжуй використовувати `ProgressRing`.

### Skeleton

Плейсхолдери завантаження. Стандартна анімація — `motion-safe:animate-pulse`;
режим `shimmer` — token-driven `motion-safe:animate-shimmer`. Під
`prefers-reduced-motion: reduce` обидва режими колапсяться до
статичного muted-блоку.

- **Variants** (`variant` props або окремі компоненти):
  - `rect` (дефолт) — гнучкий блок; розмір через `className`.
  - `text` (`<SkeletonText lines={N} />`) — багаторядковий текст з
    детерміновано варіативними ширинами (останній рядок коротший).
  - `avatar` (`<SkeletonAvatar />`) — круг.
  - `card` (`<SkeletonCardBlock />`) — повна картка з avatar +
    назва/субтитр + три рядки тексту.
- **Shape-aware variants** (`SkeletonTransactionRow`, `SkeletonHabitRow`,
  `SkeletonWorkoutSet`, `SkeletonMealCard`) — для відповідних модулів;
  див. «Скелети» в § Мотион.

```tsx
<SkeletonText lines={4} shimmer />
<SkeletonAvatar className="w-12 h-12" />
<SkeletonCardBlock />
```

---

## 6. Focus, disabled, loading — єдиний контракт

| Стан             | Поведінка                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `:focus-visible` | `ring-2 ring-brand-500/45 ring-offset-2 ring-offset-surface` на кнопках, `ring-brand-500/30` на інпутах         |
| `:disabled`      | `opacity-50`, `cursor-not-allowed`, `pointer-events-none`                                                       |
| `loading`        | Показує `Spinner`, встановлює `aria-busy="true"`, disables pointer events                                       |
| `:active`        | `active:scale-[0.98]` для прес-feedback                                                                         |
| `:hover`         | Тільки там, де `hover:` реально працює (не-touch); на `interactive` картках — `translate-y-[-2px] shadow-float` |

---

## 7. Мобільні брейкпоінти

Перевіряй кожен екран на:

- **375 px** — iPhone SE / 12 mini (дефолтний mobile)
- **414 px** — iPhone 14 Pro Max / Pro
- **768 px** — iPad / планшет (вмикає `md:` префікси)

Правила:

1. Touch targets ≥44×44 (розмір `Button md`+, `IconButton md`+).
2. `min-h-[44px]` для інпутів навіть коли контент коротший.
3. Текст в інпутах ≥16 px — інакше iOS зумить екран при фокусі.
4. Safe-area insets (notch / home indicator) — через `page-tabbar-pad`,
   `routine-main-pad`, `fizruk-above-tabbar` (див. `src/index.css`).

---

## 8. Темна тема

Увімкнення — клас `dark` на `<html>`. Всі кольори резолвяться через CSS-
змінні `--c-*`, тож додавати `dark:bg-...` більшості разів **НЕ треба**:

```tsx
// ❌ НЕ пиши
<div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700">

// ✅ Пиши
<div className="bg-surface border border-border">
```

Dark-override потрібен тільки коли ефект несиметричний між темами
(напр. градієнти hero-картки). У таких випадках документуй у комменті.

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

---

## 10. Coding rules

- `pnpm lint:imports` блокує імпорт `./components/ui/*` всередині
  модулів — використовуй `@shared/components/ui`.
- `eslint no-restricted-syntax` блокує retired-палітри `forest-*` і
  `accent-NNN` (табличні варіанти). Використовуй `accent`, `brand-500`,
  `fizruk`, `routine`, `nutrition`, `finyk`.
- Не створюй кастомних кнопок / картки поза `@shared/components/ui`.
  Якщо потрібен новий паттерн — додай варіант у примітив, а не пиши
  inline `<button className="h-11 px-5 bg-teal-500 text-white ...">`.
- Не пиши hex-кольори в `className`. Додай CSS-змінну + Tailwind alias.
- Hover-ефекти не повинні ламати touch-скрол; завжди враховуй
  `@media (hover: hover)` або використовуй `active:` для touch.

---

## 11. Міграційні патерни

Якщо рефакториш існуючий екран:

| Знайди                                                                | Заміни на                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------- |
| `text-2xs font-bold text-subtle uppercase tracking-widest`            | `<SectionHeader size="xs">`                          |
| `<button className="h-9 w-9 rounded-full ...">...</button>`           | `<IconButton aria-label="…">...</IconButton>`        |
| `bg-white dark:bg-stone-900 border border-stone-200`                  | `bg-surface border border-border`                    |
| `bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 ...` | `bg-danger-soft text-danger border border-danger/30` |
| Ad-hoc `<svg className="animate-spin ...">`                           | `<Spinner size="sm" />`                              |
| `text-gray-500` / `text-stone-500`                                    | `text-muted`                                         |
| `focus:ring-*`                                                        | `focus-visible:ring-*`                               |

---

## 12. Нові компоненти (2026-04)

### CelebrationModal

Універсальний модал для святкування досягнень з confetti та анімаціями.

```tsx
import { useCelebration } from "@shared/components/ui/CelebrationModal";

const { success, achievement, confetti, goalCompleted, levelUp, streak } =
  useCelebration();

// Простий success toast
success("Збережено!", "Дані оновлено");

// Achievement з rewards
achievement("Перша транзакція!", "Ти зробив перший крок", [
  { icon: "💰", label: "Фінансист" },
]);

// Full confetti celebration
confetti("Готово!", "Онбординг завершено", "high");
```

**Типи:** `success` | `achievement` | `goal` | `levelUp` | `streak` | `confetti`
**AutoClose:** 4.5-6 секунд залежно від типу
**Accessibility:** Focus trap, Escape to close, reduced-motion safe

### FeatureSpotlight

Contextual onboarding hints з spotlight overlay.

```tsx
import { FeatureSpotlight } from "@shared/components/ui/FeatureSpotlight";

<FeatureSpotlight
  id="first-transaction"
  title="Додай першу витрату"
  description="Натисни + щоб записати витрату"
  position="bottom"
  showOnce
>
  <FABButton />
</FeatureSpotlight>;
```

**Position:** `top` | `bottom` | `left` | `right`
**Storage:** localStorage persist dismissed state per ID
**Hooks:** `useSpotlightDismissed(id)`, `useResetSpotlight()`

### ModulePageLoader

Module-specific skeleton loader для lazy-loaded modules.

```tsx
import { ModulePageLoader } from "@shared/components/ui/ModulePageLoader";

<Suspense fallback={<ModulePageLoader module="finyk" />}>
  <FinykApp />
</Suspense>;
```

**Modules:** `finyk` | `fizruk` | `routine` | `nutrition`
Показує релевантні skeleton елементи для кожного модуля.

### PullToRefreshIndicator

Native-like pull-to-refresh для PWA.

```tsx
import { usePullToRefresh } from "@shared/hooks/usePullToRefresh";

const { state, PullIndicator } = usePullToRefresh({
  onRefresh: async () => {
    await refetch();
  },
  scrollRef,
});

<PullToRefreshIndicator state={state} />;
```

---

## 13. Нові хуки (2026-04)

### useScrollHeader

Progressive header behavior — shrink/hide on scroll.

```tsx
const { isHidden, isShrunk, hasBlur } = useScrollHeader({
  shrinkThreshold: 40,
  hideThreshold: 120,
  minDelta: 8,
});
```

### useFocusTrap

Accessibility focus trap для модалів.

```tsx
const modalRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);
<div ref={modalRef}>...</div>;
```

---

## 14. Motion & Animation (2026-05-13)

> Канонічна специфікація — [Hard Rule #17 (Animation
> budget)](../governance/rules/17-animation-budget.md). Цей розділ описує
> токени та choreography, на які лінт-плагін + ESLint посилаються; код
> живе в `apps/web/src/styles/animations.css` +
> `packages/design-tokens/tailwind-preset.js`.

### 14.1 Motion tokens (CSS custom properties)

Single source of truth — `apps/web/src/styles/theme.css → :root`. Tailwind
пропускає їх через preset як `duration-*` і `ease-*`. **Рваних значень у
`className` не існує** — `duration-[230ms]` ловить ESLint (Hard Rule #17).

#### Duration scale

| Token                       | Value  | Tailwind           | Tier            | Призначення                             |
| --------------------------- | ------ | ------------------ | --------------- | --------------------------------------- |
| `--motion-duration-instant` | 75 ms  | `duration-instant` | RESPONSE        | Micro-feedback (tap, hover, focus ring) |
| `--motion-duration-fast`    | 150 ms | `duration-fast`    | RESPONSE / exit | Exit / dismissal, ghost reactions       |
| `--motion-duration-base`    | 220 ms | `duration-base`    | RESPONSE        | Default enter (більшість one-shot)      |
| `--motion-duration-slow`    | 320 ms | `duration-slow`    | RESPONSE        | Sheet / list reveal, wizard step swap   |
| `--motion-duration-slower`  | 480 ms | `duration-slower`  | CELEBRATE       | Larger pops (check-bounce, shake, bars) |
| `--motion-duration-slowest` | 680 ms | `duration-slowest` | CELEBRATE       | Bursts, milestone fanfare               |

> AMBIENT loops жодного з шести не використовують — їх тривалість
> інтенційно довша. Канонічні AMBIENT-тривалості:
> `--motion-duration-loop-spin` (800 ms), `--motion-duration-loop`
> (1500 ms, shimmer), `--motion-duration-loop-glow` (2000 ms),
> `--motion-duration-loop-float` (8000 ms),
> `--motion-duration-confetti-fall` (2500 ms — CELEBRATE).

#### Easing scale

| Token                      | Cubic-bezier        | Tailwind          | Коли вживати                                          |
| -------------------------- | ------------------- | ----------------- | ----------------------------------------------------- |
| `--motion-ease-standard`   | `.2, 0, 0, 1`       | `ease-standard`   | Sustained transitions (transforms, shared backdrops). |
| `--motion-ease-emphasized` | `.3, 0, 0, 1`       | `ease-emphasized` | Sustained transitions з акцентом (focus moments).     |
| `--motion-ease-accelerate` | `.3, 0, 1, 1`       | `ease-accelerate` | Exits / dismissals (елемент тікає з екрана).          |
| `--motion-ease-decelerate` | `0, 0, .2, 1`       | `ease-decelerate` | Enters / reveals (елемент влітає в екран).            |
| `--motion-ease-overshoot`  | `.34, 1.56, .64, 1` | `ease-overshoot`  | CELEBRATE пружинні pop-и (check-bounce, fab-item).    |

Legacy aliases (`ease-smooth`, `ease-bounce`, `ease-spring`) залишаються
як synonyms, але не використовуй для нового коду.

### 14.2 Choreography rules

#### Animation budget (Hard Rule #17)

- **3 tiers** з різною семантикою — див. таблицю нижче.
- **Max 1 AMBIENT + 1 RESPONSE simultaneously** на екрані. Stagger-група
  рахується як **одна** RESPONSE незалежно від кількості дітей.
- **CELEBRATE — лише milestone-події** (7/30/100/365 day streaks, weekly
  goal hit, first entry). NOT every checkbox.

| Tier      | Lifecycle                | Duration range              | Easing                             | Reduced-motion            |
| --------- | ------------------------ | --------------------------- | ---------------------------------- | ------------------------- |
| AMBIENT   | Infinite loop            | 800 ms – 8 s                | linear / standard                  | Pause (зберігається стан) |
| RESPONSE  | One-shot per user action | 75 – 320 ms                 | decelerate / accelerate / standard | Opacity fade ≤ 100 ms     |
| CELEBRATE | One-shot, milestone      | 480 – 680 ms (+ 2.5 s loop) | overshoot / decelerate             | Opacity fade ≤ 100 ms     |

#### Stagger

- Канонічна утиліта — `.stagger-children` (нова, token-driven). Старий
  `.stagger-enter` — legacy alias з тим же розкладом, його не вживай у
  новому коді.
- **Cadence:** `animation-delay: index × 30 ms`, починаючи з 6-ї дитини
  застряє на `150 ms` total cap.
- **Бюджет:** group counts as 1 RESPONSE; не пушай ще одну RESPONSE
  поверх неї одночасно.

```html
<ul class="stagger-children">
  <!-- 6+ дітей: 0 ms, 30 ms, 60 ms, 90 ms, 120 ms, 150 ms (cap) -->
</ul>
```

#### Enter / exit helpers (sheets, modals, menus)

Token-driven choreography для overlay-примітивів. Кожен має `-enter` і
`-exit` пару — enter йде `ease-decelerate`, exit `ease-accelerate`, бо
елемент тікає.

| Helper            | Enter                                        | Exit                                            |
| ----------------- | -------------------------------------------- | ----------------------------------------------- |
| `.motion-sheet-*` | `slide-in-up` × `duration-slow` × decelerate | `slide-out-down` × `duration-base` × accelerate |
| `.motion-modal-*` | `scale-in` × `duration-base` × decelerate    | `scale-out` × `duration-fast` × accelerate      |
| `.motion-menu-*`  | `fade-in` × `duration-fast` × decelerate     | `fade-out` × `duration-instant` × accelerate    |

```tsx
{
  open && <div className="motion-sheet-enter">…</div>;
}
{
  closing && <div className="motion-sheet-exit">…</div>;
}
```

### 14.3 `prefers-reduced-motion` strategy (WCAG 2.3.3)

Стратегія живе в самому низу `apps/web/src/styles/animations.css` і
вмикається двома шляхами:

1. **OS-level** — `@media (prefers-reduced-motion: reduce)` (system
   setting).
2. **Showcase / тести** — клас-предок `.simulate-reduced-motion`
   (тогл-кнопка в `DesignShowcase → Motion`).

Поведінка по tiers:

- **AMBIENT** (shimmer, streak-glow, pull-rotate, float-slow,
  pulse-soft, spin, wiggle, fade-in-slow) — `animation-play-state:
paused`. Елемент залишається composed, але рух зупиняється.
- **RESPONSE + CELEBRATE** — keyframe-set свопиться на
  `rm-opacity-fade`, тривалість фіксується на 100 ms, easing —
  `decelerate`. State change залишається помітним, vestibular load
  зникає.

### 14.4 Legacy animation-class inventory

Покриває `apps/web/src/styles/animations.css` (всі класи pinned до
motion-tokens, без magic numbers).

| Class                      | Tier      | Використання               |
| -------------------------- | --------- | -------------------------- |
| `animate-shake`            | RESPONSE  | Form validation errors     |
| `animate-confetti-fall`    | CELEBRATE | CelebrationModal particles |
| `animate-streak-milestone` | CELEBRATE | Achievement / streak cards |
| `animate-scale-out`        | RESPONSE  | Modal exit                 |
| `animate-stagger-in`       | RESPONSE  | List item stagger entrance |
| `animate-shimmer`          | AMBIENT   | Skeleton placeholder       |
| `animate-streak-glow`      | AMBIENT   | StreakFlame ≥ 7-day glow   |
| `animate-pull-rotate`      | AMBIENT   | Pull-to-refresh spinner    |
| `animate-float-slow`       | AMBIENT   | Welcome page background    |
| `animate-bar-grow`         | CELEBRATE | Chart bar entrance         |

---

## 15. Offline / Empty / Error

Користувачам потрібен один консистентний канал для кожного стану — інакше
вони отримують суперечливі сигнали («банер каже офлайн, а тост каже
ретрай», «екран порожній, але форма вже летить»). Канон зведено нижче.

### Empty

`EmptyState` з §5 — **єдиний** примітив для «немає даних» (порожній
дашборд, тренування без сетів, пуста історія). Не пиши власні
"плейсхолдер-карточки" — `compact` режим закриває in-card випадки. Action
property — це CTA-стартер потоку (наприклад, «Додати першу витрату»).

```tsx
<EmptyState
  icon="receipt"
  title="Поки що немає витрат"
  description="Додай першу — і ми покажемо твій бюджет на цей місяць."
  action={{ label: "Додати витрату", onClick: openAddTx }}
/>
```

### Offline

**Один сигнал зверху, не дві смуги.** `OfflineBanner` (`apps/web/src/core/app/OfflineBanner.tsx`)
— це канонічна стрічка під `safe-area-pt`, висота константна, вмикається
по `useOnlineStatus()`. Вона ж тягне `useSyncStatus()` і показує, скільки
дій стоїть у черзі, тож юзер одразу бачить, що локальна правка не
загубилася.

Правила:

1. **Не фарбуй банер у `danger`** — `bg-warning-strong` достатньо. Червоний у
   дорослого продукту читається як «дані втрачені», а тут вони просто
   стоять у черзі.
2. **`role="status" + aria-live="polite"`** — оголошуємо появу/зникнення,
   але не викрадаємо фокус.
3. **Не дублюй банер у toast.** Поки `navigator.onLine === false`, хук
   `useSyncErrorToast` мовчить (див. наступний підрозділ).
4. **Не ховай за анімацією входу `> 200 ms`** — користувач має побачити
   стан до того, як кликне по сесії, бо інакше тапи можуть пропадати в
   ще-не-замонтований UI.

### Error / Retry

CloudSync помилки — `useSyncErrorToast(syncErrorDetail, toast, pushAll)` у
`apps/web/src/core/App.tsx` поряд із `useCloudSync(user)`. Хук працює як
маленький стейт-машина:

| `syncErrorDetail`                      | Поведінка                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `null` (idle / success / dirty)        | no-op, скидає внутрішню де-дуп пам’ять                                        |
| `{ retryable: true, type: "network" }` | error-toast, copy "перевір з'єднання", CTA «Спробувати ще» викликає `pushAll` |
| `{ retryable: true, type: "server" }`  | error-toast, copy "сервер тимчасово", CTA «Спробувати ще»                     |
| `{ retryable: false }` (4xx / parse)   | error-toast без CTA, copy «передивись введення»                               |
| `navigator.onLine === false`           | suppress — `OfflineBanner` уже сигналить                                      |

Тривалість тоста — `SYNC_ERROR_TOAST_DURATION_MS = 8000` (5 c дефолту мало
для «прийняти рішення про ретрай»). Якщо помилка змінює повідомлення, хук
сам диспозитить попередній тост, щоб черга не пухла.

Правила:

1. **Один error-toast на помилку**, не один-на-рендер. `useSyncErrorToast`
   де-дуплікує по `syncErrorDetail.message`.
2. **Retry CTA — лише коли `detail.retryable === true`.** 4xx/parse/aborted
   — не ретраїмо: помилка ніколи не зникне сама і ми зациклимо нудьгу.
3. **Copy — українською**, без «помилка #500». Користувач має знати, що
   робити, а не що зламалося.
4. **Не ставимо blocking modal** для sync-помилок — це фонове, не
   user-initiated.

### Інші toast-патерни

- **`showUndoToast`** (`@shared/lib/undoToast`) — деструктивні дії
  (видалення звички / транзакції) АБО **mutator-tool-call у HubChat**: 5 c,
  кнопка «Повернути». Не плутати з retry-toast: `undo` повертає минулий
  стан, `retry` повторює невдалу дію.

#### HubChat tool-call undo

Mutator-handler-и в `apps/web/src/core/lib/chatActions/` повертають
`{ result: string; undo: () => void }` замість простого `string`. Контракт
у `types.ts → ChatActionResult`. `HubChat.tsx` після `executeActions` ітерує
по результатам і для кожного, який має `undo`, кидає
`showUndoToast(toast, { msg: result, onUndo: undo })`. Read-only handler-и
(`find_transaction`, `weekly_summary`, …) залишаються `string` — нема що
реверсити.

Правила для нових mutator-handler-ів:

1. **`undo` має бути ідемпотентним.** Користувач не повторить дію — але
   паралельні UI-зміни (видалення з іншого екрану) можуть зробити стан
   таким, що скасовувати нема чого. У такому разі — `return` без throw.
2. **Тримай у замиканні `id` створеної сутності, а не повний snapshot
   стану.** Snapshot переписує паралельні правки; `id`-філтр прибирає
   тільки свою мутацію.
3. **Якщо мутація — no-op** (напр., `mark_habit_done` для дати, де галочка
   вже стоїть) — повертай простий `string`, не `{ undo }`. Toast «Повернути
   на нічого» збиває з пантелику.
4. **Зміни тестів:** хелпер `call()` у `*.test.ts` приймає обидві форми
   (`typeof out === "string" ? out : out.result`). Додай окремий
   `describe("<tool> · undo")`-блок з тестами на видалення, ідемпотентність
   та no-op гілку.

- **`tryShowCrossModulePrompt`** (`@shared/lib/crossModulePrompt`) — нудж із
  модуля в модуль («витрата в ресторані → запиши прийом їжі?»). Має
  fatigue-suppression на дисмиси.

---

## 16. Gestures & a11y (2026-04, batch 3)

Третій batch UX-покращень додав три горизонтальні примітиви: dismiss-by-drag для
overlay-ів, headless-сповіщення для скрін-рідерів, і live-feedback для tab-swipe.

### Sheet — swipe-to-dismiss

`Sheet` (bottom sheet) і `ConfirmDialog` (модалка) тепер закриваються
свайпом униз. Жест прив'язаний до **handle pill + header** (Sheet) або до
всього контейнера (ConfirmDialog), щоб не конфліктувати зі скролом /
текстовими інпутами в body.

- Поріг: `80px` (`useSwipeToDismiss` default).
- Snap-back: `200ms cubic-bezier(0.32, 0.72, 0, 1)` через `translate3d`.
- Coercion: на `ConfirmDialog` dismiss = "cancel" (не "confirm").

Жест працює і на тач-скрінах, і на трекпадах через **Pointer Events** з
`setPointerCapture`. Зворотну сумісність із кнопкою `×` / Escape
збережено.

### ModuleSettingsDrawer — swipe-right-to-dismiss

`ModuleSettingsDrawer` (правий side-drawer) використовує той самий хук
з `direction: "right"`. Жест прив'язаний **тільки до header** —
налаштування в body часто містять інпути / списки, які не мають
"крастися" вбік під час скролу.

### `useSwipeToDismiss` — спільний headless хук

```tsx
import { useSwipeToDismiss } from "@shared/hooks";

const swipe = useSwipeToDismiss({
  threshold: 80, // default 80px
  direction: "down", // "down" | "right"
  overshootResistance: 1, // 1 = no resistance, >1 = rubber-band
  enabled: open,
  onDismiss: onClose,
});

return (
  <div
    {...swipe.bind}
    style={{
      // Consumer reapplies the same axis it passed in options.
      transform: `translate3d(0, ${swipe.dragOffset}px, 0)`,
      transition: swipe.dragging
        ? "none"
        : "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)",
    }}
  />
);
```

**Контракт:**

| Поле         | Тип                                      | Призначення                               |
| ------------ | ---------------------------------------- | ----------------------------------------- |
| `bind`       | `{ onPointerDown / Move / Up / Cancel }` | Розпаковуй у елемент-ручку через `{...}`  |
| `dragOffset` | `number` (≥ 0)                           | Поточний offset уздовж осі для transform  |
| `dragging`   | `boolean`                                | true в момент drag — вимикай `transition` |

**Не біндь жест на body зі скролом / інпутами** — handle/header only,
інакше pointer events перехоплюються до scroll-у.

### `ScreenReaderAnnouncerProvider` + `useAnnounce`

Глобальний headless-об'явник, змонтований **в `App.tsx` над
`ApiClientProvider` / `AuthProvider`**, рендерить два невидимі
`aria-live` регіони (`polite` + `assertive`). `useAnnounce()`
повертає імперативний `announce(message, options?)`, який AT
(NVDA / JAWS / VoiceOver / TalkBack) озвучить у наступному циклі.

```tsx
import { useAnnounce } from "@shared/components/ui";

const { announce } = useAnnounce();

// Polite — для нейтральних подій
announce("Тренування збережено.");

// Assertive — для помилок / критичних змін
announce("Не вдалось зберегти. Спробуй ще раз.", { assertive: true });
```

Викликай `announce()`:

- При відкритті будь-якого `Sheet` (озвучує `title`).
- При тоглі `Switch` (через проп `announceText`, див. нижче).
- При завершенні мутації, яку користувач ініціював, але результат не
  показує одразу візуально (workout finish, save settings, …).

**Не дублюй `aria-live`** на сторінках — провайдер уже один на весь
застосунок. Це особливо важливо для мобільних read-режимів, де AT
читають кожен live-регіон окремо.

### `Switch` — `announceText`

```tsx
<Switch
  checked={pushOn}
  onChange={setPushOn}
  label="Push-сповіщення"
  announceText={(checked) =>
    checked ? "Push-сповіщення увімкнено" : "Push-сповіщення вимкнено"
  }
/>
```

Якщо `announceText` не передано і `label` задано — `Switch` все одно
озвучить дефолтне `"{label} увімкнено / вимкнено"`. Без `label` — нічого
не озвучується. Щоб явно придушити озвучення при заданому `label`,
передай `() => ""`. Колбек отримує **новий** стан після toggle.

### `useSwipeNavigation` — shared swipe-between-tabs hook

Спільний хук для горизонтального свайпу між табами модульних шеллів
(Фінік / Фізрук / Рутина / Харчування).

```ts
import { useSwipeNavigation } from "@shared/hooks/useSwipeNavigation";

const swipe = useSwipeNavigation({
  onSwipeLeft: goToNextTab,   // ← next tab
  onSwipeRight: goToPrevTab,  // ← previous tab
  atStart: activeIndex === 0,
  atEnd: activeIndex === tabs.length - 1,
  enabled: !isModalOpen,
});

// Wire handlers to the page wrapper:
<div
  onTouchStart={swipe.onTouchStart}
  onTouchMove={swipe.onTouchMove}
  onTouchEnd={swipe.onTouchEnd}
  style={{ transform: `translate3d(${swipe.dragDx * 0.45}px, 0, 0)` }}
>
```

**Відмова від свайпу:** Додай `data-no-swipe` до будь-якого
горизонтально-прокрутного елементу, щоб він не перехоплював жест
(фільтр-стрічки, каруселі тощо). Елементи з `overflow-x: auto|scroll`
автоматично виключаються.

**Visual feedback (Finyk pattern):**

- **Live drag follow** — page wrapper рухається разом із пальцем
  (`translate3d(dx * 0.45, 0, 0)`) для тактильного відгуку.
- **Top progress bar** — тонка `bg-{module}` смужка згори, що
  заповнюється до threshold (`swipe.dragDx / threshold * 100%`).

---

## 18. DropdownMenu та Command Palette (2026-05, Track 5)

Дві keyboard-first примітиви, які витягують продукт зі стану «це просто
вебсайт». DropdownMenu — для контекстних дій на конкретному елементі;
Command Palette — глобальний ⌘K / Ctrl+K surface для cross-cutting
команд (навігація, налаштування, темa, AI).

### 18.1 DropdownMenu

```tsx
import { DropdownMenu, Icon, Button } from "@shared/components/ui";
import type { DropdownMenuEntry } from "@shared/components/ui";

const items: DropdownMenuEntry[] = [
  { type: "label", label: "Профіль" },
  {
    type: "item",
    id: "edit",
    label: "Редагувати",
    icon: <Icon name="edit" />,
    shortcut: "⌘ E",
  },
  {
    type: "item",
    id: "share",
    label: "Поділитись",
    description: "Згенерувати посилання",
  },
  { type: "separator" },
  {
    type: "submenu",
    id: "more",
    label: "Більше",
    items: [
      { type: "item", id: "archive", label: "Архівувати" },
      { type: "item", id: "delete", label: "Видалити", destructive: true },
    ],
  },
];

<DropdownMenu
  ariaLabel="Дії з елементом"
  items={items}
  trigger={
    <Button variant="secondary">
      Меню <Icon name="chevron-down" />
    </Button>
  }
/>;
```

**Entry types:** `item` · `submenu` · `separator` · `label`.

**Клавіатурна навігація:**

| Клавіша                 | Дія                                                 |
| ----------------------- | --------------------------------------------------- |
| `ArrowDown` / `ArrowUp` | Перейти на наступний / попередній item (wrap).      |
| `Home` / `End`          | Перший / останній focusable item.                   |
| `Enter` / `Space`       | Активувати item або відкрити підменю.               |
| `ArrowRight`            | Відкрити підменю (на submenu-row).                  |
| `ArrowLeft`             | Закрити підменю.                                    |
| `Escape`                | Закрити меню, фокус повертається на trigger.        |
| `Tab`                   | Закрити меню, природна tab-навігація продовжується. |
| `a…z` / `0…9`           | Type-ahead (буфер очищується через 500 мс).         |

**ARIA:** `aria-haspopup="menu"` + `aria-expanded` на trigger;
`role="menu"` на панелі; `role="menuitem"` + `aria-disabled` на рядках;
підменю — `aria-haspopup="menu"` + `aria-expanded`.

**Стилі:** виключно semantic tokens (`bg-panel`, `border-line`,
`text-text`, `text-danger`, `bg-panelHi` для фокусу).
`focus-visible:ring-brand-500/45` — клавіатурне кільце; pointer-hover
ділить ту саму `bg-panelHi`-підсвітку.

### 18.2 CommandPalette

```tsx
// 1. У app shell — раз:
import {
  CommandPalette,
  CommandPaletteProvider,
  useCommandPaletteHotkey,
} from "@shared/components/ui";

<CommandPaletteProvider>
  <CommandPalette />
  <RestOfApp />
</CommandPaletteProvider>;

// 2. В будь-якому компоненті — реєструємо команди:
useRegisterCommand("hub.nav", [
  {
    id: "hub.go-home",
    title: "Перейти на головну",
    group: "Навігація",
    icon: <Icon name="home" />,
    keywords: ["hub", "home", "головна"],
    run: () => navigate("/"),
  },
]);
```

⌘K / Ctrl+K привʼязується через `useCommandPaletteHotkey(enabled)` — у
Sergeant це гейтнуте feature-flag-ом `hub_command_palette`, тож існуючий
Hub-search ⌘K не зламається до моменту увімкнення.

**Клавіатура у відкритій палітрі:** `ArrowUp/Down` — навігація по
плоскому списку (через групи), `Home/End` — перший / останній,
`Enter` — виконати, `Escape` — закрити.

**ARIA:** `role="dialog"` + `aria-modal` + `aria-labelledby`;
`role="listbox"` для результатів, `role="option"` + `aria-selected` для
рядків. `aria-activedescendant` оновлюється на input разом з
`activeIndex` — screen reader озвучує активну команду, поки фокус
лишається в інпуті.

**Recent commands:** зберігаються у `localStorage` (до 6 останніх ID)
через `createTypedStore` з версією і zod-схемою — впишеться в існуючий
storage-allowlist.

**Стилі:** `bg-panel`, `border-line`, `shadow-float`, `bg-black/50` для
backdrop. Фокусне кільце — `focus-visible:ring-brand-500/45` з
`ring-offset-panel` (узгоджено з `Button`).

### 18.3 Анатомія підказок

Shortcut-hint і footer hint-и використовують `<kbd>` з токенами:
`bg-surface-muted border border-line text-muted text-2xs font-mono`.
Це уніфікує вигляд cmd-keys на overlays, modals, palette і inline-help.

### 18.4 Status

`DropdownMenu`, `CommandPalette` — Active (Track 5). Demo команди в
`useDemoCommands` — Scaffolded: реальні handlers приходять follow-up
PR-ами per-модуль. `console.log` + toast «WIP» — навмисна заглушка.

---

## 19. Що далі

- Догнати всі модулі (ФІНІК / ФІЗРУК / Рутина / Харчування) під єдині
  примітиви — окремими PR'ами, по модулю.
- Додати Storybook-подібну сторінку `/design` з живими прикладами.
- Розширити WCAG-audit автотестом (axe) у CI.
- Інтегрувати `FeatureSpotlight` в ключові onboarding touchpoints.
- Додати більше haptic feedback у key interactions.
- Profile page з avatar upload.
