# Sergeant Design System

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
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
   — заборонений анти-патерн. [`DARK-MODE-AUDIT.md`](./DARK-MODE-AUDIT.md)
   збережений як історія міграції; поточний guardrail —
   `sergeant-design/no-raw-dark-palette` на рівні `error` для `apps/web`.
3. **Модулі діляться токенами, а не стилями.** `bg-finyk-surface`,
   `text-fizruk`, `border-routine/30` — це семантичні аксенти; вся базова
   типографіка, spacing, радіуси одні для всіх. Всередині
   `apps/<app>/src/modules/<X>/` дозволені лише акценти модуля `<X>` —
   див. `AGENTS.md` hard rule #12 + [`MODULE-ACCENT.md`](./MODULE-ACCENT.md),
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

Всі розміри — в `tailwind.config.js` під `fontSize`. Мінімальний
розмір — **10px (`text-2xs`)**. `text-3xs` (9px) було видалено зі
шкали — його контраст не проходив читабельність на мобільних, а
бібліотека чартів вже використовує власні axis-ticks.

| Клас        | Size / line-height | Використання                              |
| ----------- | ------------------ | ----------------------------------------- |
| `text-2xs`  | 10 / 14            | Декоративні мета-бейджі, chart axis ticks |
| `text-xs`   | 12 / 16            | Метадата, timestamp, secondary captions   |
| `text-sm`   | 14 / 20            | Вторинний текст, кнопки `sm`              |
| `text-base` | 16 / 24            | Базовий body                              |
| `text-lg`   | 18 / 28            | Заголовок картки                          |
| `text-xl`   | 20 / 28            | Section heading `md`                      |
| `text-2xl`  | 24 / 32            | Page heading mobile                       |
| `text-hero` | 26 / 32            | Hero stat numbers                         |
| `text-3xl`  | 30 / 36            | Hero heading                              |
| `text-4xl`  | 36 / 40            | Landing hero                              |
| `text-5xl`  | 48 / 1             | Рідкісні великі промо-цифри               |

### Семантичні `.text-style-*` ютиліті

Кожна виконує одну роль і одночасно зашиває font-size, line-height,
weight, letter-spacing і casing. Перевага — над "ручним" комбо
`text-* font-* tracking-*`, бо неможливо змішати hero-розмір з
неправильною вагою:

| Утиліта                | Контракт                       | Використання                      |
| ---------------------- | ------------------------------ | --------------------------------- |
| `.text-style-hero`     | 26 / 32 / 700 / -0.02em        | Page H1, hero stat number         |
| `.text-style-title`    | 20 / 28 / 600 / -0.01em        | Section heading, card title       |
| `.text-style-body`     | 16 / 24 / 400                  | Основний body                     |
| `.text-style-label`    | 14 / 20 / 500                  | Form label, button text           |
| `.text-style-caption`  | 12 / 16 / 400                  | Helper text, metadata, timestamps |
| `.text-style-overline` | 12 / 16 / 600 / 0.06em / UPPER | Section kicker / eyebrow          |

### Канонічна `.text-*` шкала (tier-2 — окремі утиліти)

Поряд з `text-style-*` живе ще один шар — окремі семантичні утиліти, які
закривають дрібніші, нижчі та більші розміри, що не мають своєї
семантичної ролі в `text-style-*`. Усі вони визначені в
`apps/web/src/index.css`:

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

### Тіні

| Клас           | Джерело                   | Коли                     |
| -------------- | ------------------------- | ------------------------ |
| `shadow-soft`  | `--shadow-soft`           | Фонова підсвітка блоку   |
| `shadow-card`  | `--shadow-card`           | Дефолт для `Card`        |
| `shadow-float` | `--shadow-float`          | Hover, плаваючі елементи |
| `shadow-glow`  | Tailwind (брендовий blur) | CTA, акценти, фокуси     |

Темна тема має власні значення змінних — не додавай `dark:shadow-*`.

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

### EmptyState

- `icon` · `title` · `description` · `action`.
- `compact` режим для in-card плейсхолдерів.
- Використовуй для всіх «немає да��их» станів — не роби ad-hoc.

### Spinner

Канонічний індикатор завантаження (4 розміри). Використовується всередині
`Button loading`, інлайн-фетчі, skeleton overlay.

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

### useFormValidation

Form validation з shake animation та haptic feedback.

```tsx
const { values, errors, touched, shaking, handleChange, handleBlur, validate } =
  useFormValidation(
    {
      email: "",
      password: "",
    },
    {
      email: [validationRules.required(), validationRules.email()],
      password: [validationRules.required(), validationRules.minLength(8)],
    },
  );
```

**Built-in rules:** `required`, `email`, `minLength`, `maxLength`, `pattern`, `numeric`, `matches`

### useFocusTrap

Accessibility focus trap для модалів.

```tsx
const modalRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);
<div ref={modalRef}>...</div>;
```

---

## 14. Animations (2026-04)

Нові анімації в `styles/animations.css`:

| Class                      | Keyframes        | Використання                  |
| -------------------------- | ---------------- | ----------------------------- |
| `animate-shake`            | shake            | Form validation errors        |
| `animate-confetti-fall`    | confetti-fall    | CelebrationModal particles    |
| `animate-streak-milestone` | streak-milestone | Achievement/celebration cards |
| `animate-scale-out`        | scale-out        | Modal exit animation          |
| `animate-stagger-in`       | stagger-in       | List item stagger entrance    |

Всі анімації поважають `prefers-reduced-motion` через `motion-safe:` prefix.

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

## 17. Що далі

- Догнати всі модулі (ФІНІК / ФІЗРУК / Рутина / Харчування) під єдині
  примітиви — окремими PR'ами, по модулю.
- Додати Storybook-подібну сторінку `/design` з живими прикладами.
- Розширити WCAG-audit автотестом (axe) у CI.
- Інтегрувати `FeatureSpotlight` в ключові onboarding touchpoints.
- Додати більше haptic feedback у key interactions.
- Profile page з avatar upload.
