# Sergeant Brandbook & Design-система

> **Last touched:** 2026-08-22 by @Skords-01. **Next review:** 2027-04-01.
> **Status:** Active

Дизайн-філософія Sergeant — **Soft & Organic** на теплій крем-базі.

> **⚠️ Канон палітри — [`DESIGN.md`](../../../DESIGN.md) (генерується з `packages/design-tokens/tokens.js`).**
> Після stone-ребренду M1 (2026-07) `brand` більше не aliasить emerald: це `stone-700 #44403c`
> (`-strong` = `stone-800 #292524`), а finyk перейшов з emerald-500 на **teal-700 `#0f766e`**
> (`-strong` / `chart-finyk` = teal-800 `#115e59`). Fizruk перейшов з teal на cyan-700 у
> v2-редизайні 2026-05. Emerald лишається лише семантичним `success`. Історичні emerald-таблиці
> нижче зберігаються як контекст бренд-ідентичності; при розбіжності перемагають токени.
> Цей документ описує бренд-ідентичність, голос і marketing-asset-и.
> **Для UI-коду** — починай із [`design-system.md`](./design-system.md): саме він
> тримає канонічні токени, type-scale, компоненти і ESLint-контракти. Якщо щось
> у брендбуку розходиться з дизайн-системою — перемагає дизайн-система.

---

## Бренд-ідентичність

### Назва й голос

- **Назва:** Sergeant (Сержант)
- **Tagline:** «Твій персональний хаб життя»
- **Voice:** дружній, мотивуючий, підтримуючий — як корисний друг, а не drill-сержант
- **Tone:** теплий, ободрюючий, ясний, ukrainian-first

### Бренд-персональність

- **Доступний:** не лякає, вітає новачків
- **Підтримуючий:** святкує маленькі перемоги, не соромить за пропущені цілі
- **Розумний:** дає інсайти без перевантаження
- **Грайливий:** гейміфікаційні елементи в дусі Duolingo

---

## Кольорова система

### Основні бренд-кольори

#### Emerald (основний акцент)

Головний бренд-колір — символ росту, здоров'я й фінансового добробуту.

```
Emerald 50:  #ecfdf5  (Lightest surfaces)
Emerald 100: #d1fae5
Emerald 200: #a7f3d0  (Rings, borders)
Emerald 300: #6ee7b7
Emerald 400: #34d399  (Light accent)
Emerald 500: #10b981  (PRIMARY - buttons, icons)
Emerald 600: #059669  (Hover states)
Emerald 700: #047857  (Dark accent)
Emerald 800: #065f46
Emerald 900: #064e3b  (Darkest)
```

#### Teal (вторинний акцент)

Використовується для модуля Fizruk і додаткових акцентів.

```
Teal 50:  #f0fdfa
Teal 100: #ccfbf1
Teal 200: #99f6e4
Teal 300: #5eead4
Teal 400: #2dd4bf
Teal 500: #14b8a6  (legacy Fizruk primary, retired у v2 redesign 2026-05)
Teal 600: #0d9488
Teal 700: #0f766e
```

Sergeant v2 редизайн (2026-05) виокремив окрему **Cyan**-палітру для
Fizruk-модуля, аби disambiguate його від finyk-emerald spectrum:

```text
Cyan 50:  #ecfeff
Cyan 200: #a5f3fc  (fizruk-soft v2)
Cyan 700: #0e7490  (Fizruk primary — v2)
Cyan 800: #155e75  (fizruk-strong v2 — WCAG AA companion)
```

### Кольори модулів

| Модуль    | Primary | Surface | Сфера      |
| --------- | ------- | ------- | ---------- |
| Finyk     | #0f766e | #f0fdfa | Фінанси    |
| Fizruk    | #0e7490 | #ecfeff | Фітнес     |
| Routine   | #f97066 | #fff5f3 | Звички     |
| Nutrition | #92cc17 | #f8fee7 | Харчування |

#### Chart series

Bar-чарти у `HubReports` та майбутніх дашбордах використовують семантичні
`chart-{module}` токени замість raw Tailwind-палітри. Кожен токен маппується
до `-strong` тіру свого модуля — це гарантує ≥ 5:1 на кремовому `bg-bg`.

| Токен             | Utility              | Hex       | Contrast vs `bg-bg` |
| ----------------- | -------------------- | --------- | ------------------- |
| `chart-finyk`     | `bg-chart-finyk`     | `#115e59` | 5.12 : 1            |
| `chart-fizruk`    | `bg-chart-fizruk`    | `#155e75` | 7.50 : 1            |
| `chart-routine`   | `bg-chart-routine`   | `#c23a3a` | 5.06 : 1            |
| `chart-nutrition` | `bg-chart-nutrition` | `#466212` | 6.64 : 1            |

Raw `bg-sky-500`, `bg-orange-500`, `bg-emerald-500`, `bg-lime-500` тощо у
`core/hub/Hub*.tsx` заборонені дизайн-конвенцією module-accent containment
(tokens + review, ex-Hard Rule #12, retired ADR-0081; G2, 2026-05-14).
Додавай лише `bg-chart-*` токени.

### Семантичні кольори

```
Success:  #10b981 (Emerald 500)
Warning:  #f59e0b (Amber 500)
Danger:   #ef4444 (Red 500)
Info:     #0ea5e9 (Sky 500)
```

### WCAG-AA-тір `-strong`

Насичені відтінки вище коректні для **бренд-ідентичності** (лого, marketing-asset-и, dark-mode-рендер, App Store-скріншоти, solid-module-surface-и), але **не** проходять WCAG 2.1 AA 4.5 : 1 на фоні сторінки `bg-bg` (`#ecebe7`) чи чисто білому `bg-panel` (`#ffffff`) на body-розмірах. Кожен насичений brand-колір має `-strong`-companion-а. **Використовуй тір strong, коли колір рендериться як текст або як fill під `text-white`.**

| Family  | Saturated (DEFAULT) | Strong (Tailwind utility)                                 | Hex       | vs `bg-bg` `#ecebe7` | vs `text-white` |
| ------- | ------------------- | --------------------------------------------------------- | --------- | -------------------- | --------------- |
| brand   | `#44403c`           | `bg-brand-strong` / `text-brand-strong` (= stone-800)     | `#292524` | 12.72 : 1            | 15.17 : 1       |
| success | `#10b981`           | `bg-success-strong` / `text-success-strong` (emerald-800) | `#065f46` | 6.44 : 1             | 7.68 : 1        |
| warning | `#f59e0b`           | `bg-warning-strong` / `text-warning-strong` (amber-800)   | `#92400e` | 5.94 : 1             | 7.09 : 1        |
| danger  | `#ef4444`           | `bg-danger-strong` / `text-danger-strong` (red-800)       | `#991b1b` | 6.97 : 1             | 8.31 : 1        |
| info    | `#0ea5e9`           | `bg-info-strong` / `text-info-strong` (sky-800)           | `#075985` | 6.34 : 1             | 7.56 : 1        |

| finyk | `#0f766e` | `bg-finyk-strong` / `text-finyk-strong` (teal-800) | `#115e59` | 6.36 : 1 | 7.58 : 1 |
| fizruk | `#0e7490` | `bg-fizruk-strong` / `text-fizruk-strong` (cyan-800) | `#155e75` | 6.09 : 1 | 7.27 : 1 |
| routine | `#eb7691` | `bg-routine-strong` / `text-routine-strong` (rose-800) | `#8d4256` | 5.78 : 1 | 6.89 : 1 |
| nutrition | `#92cc17` | `bg-nutrition-strong` / `text-nutrition-strong` (lime-800) | `#466212` | 5.84 : 1 | 6.96 : 1 |

> **Темна тема: `text-{status}-strong` більше НЕ дорівнює колонці «Hex».**
> Таблиця вище описує **світлий** тир. У «Чорнилі» той самий red-800 на
> картці `#1b1613` дає **1.9 : 1** — тобто текст помилки форми був там
> практично невидимий, і саме це приніс тестер 2026-08-21 («червоні літери
> погано видно»). Дефект був системний: `text-{status}-strong` стоїть у 376
> місцях, і лише дві третини мали ручну пару `dark:text-{status}`.
>
> Тому роль `-strong` розведено на дві, кожна зі своїм джерелом:
>
> | Роль                                 | Утиліта                          | Джерело                               | Світла тема | «Чорнило» |
> | ------------------------------------ | -------------------------------- | ------------------------------------- | ----------- | --------- |
> | Заливка під `text-white`, рамка      | `bg-{status}-strong`, `border-…` | `statusStrongHex` (пресет, статичний) | тир -800    | тир -800  |
> | Текст на поверхні сторінки чи картки | `text-{status}-strong`           | `--c-{status}-ink` (theme.css)        | тир -800    | тир -400  |
>
> Спільного значення між ролями не існує: тексту на чорнилі потрібна
> люмінантність ≥0.20, заливці під білим — ≤0.183. Чорнильний тир (-400):
> success `#34d399` · warning `#fbbf24` · danger `#f87171` · info `#38bdf8`
> — 6.09…11.33 : 1 на ink-поверхнях. Гейти: `contrast.test.js` і
> `apps/web/src/styles/theme.softContrast.test.ts`.
>
> **Модульні `-strong` цього розведення ще НЕ мають** — `text-finyk-strong`
> і три його брати лишаються статичним тиром -800 і в темній темі так само
> темні. Механіка та сама, тож фікс механічний; борг записаний у
> [`frontend.md`](../../90-work/tech-debt/frontend.md).

> **Числа переміряно 2026-08-07 — попередні були не тим, чим підписані.**
> Колонка називалася «Contrast vs `bg-bg`», але кожне число в ній збігалося
> з контрастом проти **білого**, а не проти фону сторінки. Тобто таблиця
> двічі показувала один і той самий замір під двома різними заголовками, і
> гірший з двох випадків (текст на фоні сторінки, а не на картці) не був
> покритий узагалі. Рядок `finyk` до того ж лишався на `emerald-700` —
> кольорі, який зник із коду ще в M1-ребренді 2026-07.
>
> **Наслідок, який видно лише після перезаміру:** `warning-strong` на
> `amber-700` давав **4.21 : 1** на фоні сторінки — нижче AA. `success`
> (4.60) та `info` (4.97) проходили, але з запасом менше 0.5 — рівно
> той стан, у якому були модульні акценти перед зміною бази: формально
> зелено, а будь-який наступний зсув фону ламає мовчки.
>
> **Закрито 2026-08-07: усі чотири семантичні тири пішли на `-800`**, на
> той самий тир, що й чотири модульні акценти. Змішані тири і були тим
> ґрунтом, на якому виростали сироти: система з двома конвенціями не має
> способу відрізнити «свідомий виняток» від «забули підняти». Тепер
> найслабший тир у палітрі — 5.78, і жоден не сидить на межі.
>
> Значення живуть у `statusStrongHex` (`packages/design-tokens/tokens.js`),
> звідки їх читають і Tailwind-пресет, і `contrast.test.js`. До цього вони
> були літералами в пресеті, який тест не імпортує — саме тому 4.21 жило
> непоміченим.
>
> **Примітка про nutrition.** Lime винятково світлий на кожному степі;
> `lime-700` (`#567c0f`) дає 4.67 : 1 проти білого — лише 0.17 над порогом.
> Тому nutrition-`-strong` піднято на `lime-800`. Той самий крок згодом
> зробили finyk, fizruk і routine; на `-700` із чотирьох модулів не лишився
> жоден.

#### Матриця рішень — який тір для якого примітиву

| Primitive           | Variant / tone                                              | Background                     | Text                   | Tier rule                                    |
| ------------------- | ----------------------------------------------------------- | ------------------------------ | ---------------------- | -------------------------------------------- |
| `Button`            | `primary`, `destructive`                                    | `bg-{brand,danger}-strong`     | `text-white`           | **strong** for fill + `text-white`           |
| `Button`            | `secondary`, `ghost`                                        | `bg-panel` / transparent       | `text-text`            | no brand colour involved                     |
| `Button`            | module solid (`finyk` / `fizruk` / `routine` / `nutrition`) | `bg-{module}-strong`           | `text-white`           | **strong**                                   |
| `Button`            | module soft (`*-soft`)                                      | `bg-{module}-soft`             | `text-{module}-strong` | **strong** for text                          |
| `Badge`             | solid (any tone)                                            | `bg-{tone}-strong`             | `text-white`           | **strong**                                   |
| `Badge`             | soft (any tone)                                             | `bg-{tone}-soft`               | `text-{tone}-strong`   | **strong** for text                          |
| `Badge`             | outline (any tone)                                          | transparent                    | `text-{tone}-strong`   | **strong** for text; border keeps `*-500/60` |
| `Tabs`              | active label                                                | page bg                        | `text-{c}-strong`      | **strong** for text                          |
| `Segmented`         | active solid                                                | `bg-{c}-strong`                | `text-white`           | **strong**                                   |
| `Stat`              | coloured value                                              | inherited                      | `text-{c}-strong`      | **strong** for text                          |
| `SectionHeading`    | `accent` variant                                            | inherited                      | `text-brand-strong`    | **strong**                                   |
| `FormField`         | error message                                               | inherited                      | `text-danger-strong`   | **strong**                                   |
| `Banner`            | success / warning / danger / info                           | tinted soft surface            | `text-{tone}-strong`   | **strong** for text                          |
| `ProgressRing` SVG  | stroke colour                                               | n/a (decorative stroke ≠ text) | inherited              | saturated `-500` is fine; stroke isn't text  |
| Icons (decorative)  | any                                                         | n/a                            | n/a                    | saturated `-500` is fine                     |
| Marketing / hero    | logo, illustration                                          | n/a                            | n/a                    | **always** saturated `-500`                  |
| Dark-mode (`.dark`) | any                                                         | dark surface                   | brand `-300/400/500`   | **never** `-strong` (would regress contrast) |

Cross-platform: `-strong`-Tailwind-утиліти вивезені через
`packages/design-tokens/tailwind-preset.js`, тож їх автоматично отримують
як `apps/web` (Tailwind), так і `apps/mobile` (NativeWind). Для RN-споживачів, які
стилюються через `StyleSheet.create({ color: ... })`, `@sergeant/design-tokens/mobile`
вивозить `accentStrong` / `successStrong` / `warningStrong` / `dangerStrong` / `infoStrong`
з тими самими hex-значеннями (див. `packages/design-tokens/mobile.js`).

Повне обґрунтування, виміряння контрасту й історію міграції (PR #851 → PR #855)
див. у [`docs/05-design/design/archive/brand-palette-wcag-aa-proposal.md`](./archive/brand-palette-wcag-aa-proposal.md).

### Кольори фону (Light-режим)

```
Page Background:    #ecebe7 (Warm neutral — Б1, 2026-08-07)
Panel/Card:         #ffffff (Pure white)
Panel Hover:        #f6f5f2 (Warm hover)
Border:             #e2e0da (Warm gray)
```

> **Було `#fdf9f3` / `#faf7f1` / `#ebe4da` до 2026-08-07.** `#fdf9f3` не
> зник — це `cream.100`, і він далі працює як hero-ink та як фон
> `apps/landing` (`--color-background`). Але фоном застосунку він не є вже
> давно: до Б1 сторінка світилася `#f2ecdf`, тобто підпис у цьому блоці
> розходився з кодом ще тоді. Джерело істини — `--c-bg` / `--c-panel-hi` /
> `--c-line` у [`theme.css`](../../../apps/web/src/styles/theme.css).

### Кольори тексту (Light-режим)

```
Primary Text:   #1c1917 (Warm black - Stone 900)
Muted Text:     #57534e (Stone 600)
Subtle Text:    #a8a29e (Stone 400)
```

---

## Типографія

### Font Family

**DM Sans** — геометричний sans-serif, дружній і водночас професійний.

```css
font-family:
  "DM Sans",
  system-ui,
  -apple-system,
  "Segoe UI",
  sans-serif;
```

### Type-scale

Мінімум для будь-якого user-facing-тексту — **12px (`text-xs`)** (дизайн-конвенція —
tokens + review, ex-Hard Rule #16, retired [ADR-0081](../../04-governance/adr/0081-repository-simplification.md)).
`text-2xs` (10px) зареєстрований у preset-і, але зарезервований виключно під chart axis ticks;
у будь-якому іншому продуктовому UI — deprecated, **ніколи не використовувати для primary content**.
Повний контракт —
у [`design-system/02-typography.md` § 3](./design-system/02-typography.md#3-типографічна-шкала).
Для семантичних use-case-ів використовуй утиліти `.text-style-*`
(`.text-style-meta`, `.text-style-caption`, `.text-style-body-sm`, …) — вони
прив'язані до slots, а не до сирих pixel-розмірів.

| Назва | Size | Line Height | Weight   | Сфера                                              |
| ----- | ---- | ----------- | -------- | -------------------------------------------------- |
| 2xs   | 10px | 14px        | Medium   | **Reserved:** chart axis ticks, decorative badges  |
| xs    | 12px | 16px        | Medium   | Caption-и, badge-і, метадата (мінімум для UI-text) |
| sm    | 14px | 20px        | Regular  | Body small, кнопки                                 |
| base  | 16px | 24px        | Regular  | Body-текст                                         |
| lg    | 18px | 28px        | Medium   | Large body                                         |
| xl    | 20px | 28px        | Semibold | Заголовки карток                                   |
| 2xl   | 24px | 32px        | Bold     | Заголовки секцій                                   |
| 3xl   | 30px | 36px        | Bold     | Заголовки сторінок                                 |
| 4xl   | 36px | 40px        | Bold     | Hero-заголовки                                     |

### Товщина шрифту

- Regular (400): body-текст
- Medium (500): лейбли, caption-и
- Semibold (600): кнопки, заголовки карток
- Bold (700): заголовки, важливі числа

---

## Система відступів

На основі 4px-сітки зі стандартними Tailwind-відступами:

```
0.5: 2px    (Micro gaps)
1:   4px    (Tight spacing)
1.5: 6px
2:   8px    (Small gaps)
3:   12px   (Medium gaps)
4:   16px   (Standard spacing)
5:   20px   (Card padding)
6:   24px   (Large spacing)
8:   32px   (Section spacing)
10:  40px
12:  48px   (Page margins)
```

---

## Border-radius

М'які, органічні, дружні форми:

```
xl:   12px  (Small buttons, chips)
2xl:  16px  (Buttons, inputs)
3xl:  24px  (Cards, panels)
4xl:  32px  (Large cards, modals)
5xl:  40px  (Hero sections)
full: 9999px (Pills, avatars)
```

> **Канонічний контракт:** рав-розміри вище — референс-таблиця. У
> продакшн-коді використовуй size-driven semantic-утиліти
> (`rounded-swatch` / `rounded-marker` / `rounded-control` / `rounded-card` /
> `rounded-hero` / `rounded-pill`) з [`radius-rhythm.md`](./radius-rhythm.md);
> сирі `rounded-2xl` в `apps/web` — порушення дизайн-конвенції
> (tokens + review; колишнє ESLint-правило `no-raw-rounded-utility` retired ADR-0081).

---

## Тіні

Шаристі м'які тіні для глибини без різкості:

### Card-тінь

```css
box-shadow:
  0 1px 3px rgba(28, 25, 23, 0.04),
  0 4px 16px rgba(28, 25, 23, 0.08),
  inset 0 1px 0 rgba(255, 255, 255, 0.9);
```

### Float-тінь (Elevated/Hover)

```css
box-shadow:
  0 2px 8px rgba(28, 25, 23, 0.06),
  0 12px 40px rgba(28, 25, 23, 0.12),
  inset 0 1px 0 rgba(255, 255, 255, 0.85);
```

### Glow (focus-states)

```css
box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
```

> **Канонічний контракт:** в коді не пиши inline `box-shadow` —
> використовуй токени `shadow-card` / `shadow-float` / `shadow-glow`,
> вивезені через `packages/design-tokens/tailwind-preset.js`. Повний
> список + dark-mode-варіанти — у [`design-system.md` § 4.6](./design-system.md).

---

## Компоненти

### Кнопки

#### Primary-кнопка

- Background: `bg-brand-strong` (= emerald-700, `#047857`) — проходить
  WCAG AA 5.48 : 1 проти `text-white`. Насичений `bg-brand` (`#10b981`)
  давав лише ~2.5 : 1 і був виведений з CTA в PR #855;
  див. _WCAG-AA `-strong`-тір_ вище.
- Text: `text-white`
- Hover: темніший відтінок (`bg-brand-800`) + легкий glow
- Active: scale down до 98 %

#### Secondary-кнопка

- Background: білий panel
- Border: line-color
- Hover: легкий фон, зміна кольору border-а

#### Ghost-кнопка

- Background: прозорий
- Text: muted-колір
- Hover: легкий fill фону

### Картки

#### Default-картка

```css
.card {
  background: white;
  border: 1px solid #ebe4da;
  border-radius: 24px;
  box-shadow: /* card shadow */;
  padding: 16px;
}
```

#### Interactive-картка

Те саме, що default + hover-lift-анімація:

- Transform: translateY(-2px)
- Shadow: float-тінь
- Transition: 200ms ease-smooth

#### Hero-картка (module-branded)

Градієнтний фон відповідно до module-color.

### Progress-ring

Круглий індикатор прогресу в дусі Duolingo:

- Анімований філ при mount-і
- Центроване відображення відсотка/значення
- Module-color-варіанти

### Badge-і

Pill-status-індикатори. Усі solid-тони використовують `-strong`-fill,
щоб лейбли лишалися читабельними на body-розмірах (див. _WCAG-AA `-strong`-тір_).

- Success: `bg-success-strong` (emerald-700) + `text-white`
- Warning: `bg-warning-strong` (amber-700) + `text-white`
- Danger: `bg-danger-strong` (red-700) + `text-white`
- Outline / soft-варіанти: `text-{tone}-strong` на tinted-
  або прозорій surface
- Розміри: xs, sm, md, lg

---

## Анімації

### Timing-функції

```css
ease-smooth: cubic-bezier(0.25, 0.46, 0.45, 0.94)
ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1)
```

### Тривалість

- Fast: 150ms (hover-states)
- Default: 200ms (більшість transition-ів)
- Slow: 300ms (складні анімації)

### Ключові анімації

#### Page-Enter

Fade in + slide up від 8px.

#### Module-Slide

Slide in справа (32px) при вході в модуль.

#### Check-Pop (Duolingo-style)

Scale 0 → 1.2 → 1 з bounce-easing.

#### Success-Pulse

Розширюваний ring-glow від центру.

#### Hover-Lift

translateY(-2px) + upgrade-тіні.

#### Stagger-Enter

Діти анімуються послідовно з затримкою 50ms кожен.

---

## Градієнти

### Hero-градієнти (light-фони)

```css
/* Emerald (Finyk) */
background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 50%, #a7f3d0 100%);

/* Teal (Fizruk) */
background: linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 50%, #99f6e4 100%);

/* Rose (Routine) */
background: linear-gradient(135deg, #fff5f6 0%, #ffe7eb 50%, #fed3db 100%);

/* Lime (Nutrition) */
background: linear-gradient(135deg, #f8fee7 0%, #effccb 50%, #dff99d 100%);
```

### Hub-Hero

```css
background: linear-gradient(150deg, #fdf9f3 0%, #fefdfb 50%, #f0fdfa 100%);
```

---

## Іконки

### Гайдлайни стилю

- Stroke-товщина: 1.6–2px
- Line cap: Round
- Line join: Round
- Розміри: 16px, 18px, 20px, 22px, 24px

### Рекомендовані джерела

- Lucide Icons (primary)
- Heroicons (alternative)

---

## Доступність

### Touch-таргети

- Мінімум: 44×44px для всіх інтерактивних елементів
- Input-поля: мінімум 44px висоти

### Focus-states

- Видимий ring: 2px brand-color при 50 % opacity
- Offset: 2px від елемента

### Колірний контраст

- Текст на фонах: мінімум 4.5 : 1 (WCAG 2.1 AA, § 1.4.3)
- Large-текст (≥18 px regular **або** ≥14 px bold): мінімум 3 : 1
- Усі насичені brand-кольори (`brand` / `success` / `warning` /
  `danger` / `info` / `finyk` / `fizruk` / `routine` / `nutrition`)
  мають `-strong`-companion-а, який проходить 4.5 : 1 на body-розмірах.
  Використовуй його, коли колір виступає як текст або як fill під `text-white`.
  Повне мапування — у _Кольорова система → WCAG-AA `-strong`-тір_. Це дизайн-конвенція —
  tokens + review (колишнє ESLint-правило `no-low-contrast-text-on-fill`
  retired ADR-0081); saturated-tier-помилки ловляться на design-review.
- Showcase-роут `/design` гейтиться axe-core у CI (див.
  `apps/web/tests/a11y/axe.spec.ts`), тож будь-який примітив, що дрейфує
  назад до насиченого `-500`-fill під `text-white`, падає в pipeline
  до merge-у.

### Motion

Motion-словник синхронізовано з `design-system.md` § Motion. Три бюджети:

- **Ambient** — фонові стани (skeleton, spinner, pulse-soft).
- **Response** — реакція на дію користувача (button press, focus, success).
- **Celebrate** — рідкі віхи (стрік 7/30/100, level-up, milestone reached).

Усі контракти задокументовані в `design-system.md` § Motion і відображені в
живому showcase у розділі `#motion`. Жодна анімація не запускається без
`motion-safe:` обгортки — `prefers-reduced-motion: reduce` гасить
все, окрім opacity-transitions.

- Поважати `prefers-reduced-motion`
- Жодних автозапускних анімацій, довших за 5 секунд

### Elevation

Toolkit: `shadow-soft`, `shadow-card`, `shadow-float` плюс card-варіанти
(`default`, `interactive`, `flat`, `elevated`, `ghost`). Module hero cards
використовують `module-accent-strong` тон + `shadow-card`. Деталі —
[`design-system.md`](./design-system.md) § Elevation і showcase-якір
`#elevation`.

### Type scale

Канонічний type-scale живе в `design-system.md` § Typography. Семантичні
утиліти `.text-style-{hero,title,body,label,caption,overline}` — обов'язкові
для нового UI-коду. Голий `text-2xl font-extrabold` і eyebrow combo
(`uppercase + tracking-* + text-*`) — порушення дизайн-конвенції (tokens +
review; колишні lint-правила `prefer-text-style` / `no-eyebrow-drift`
retired ADR-0081).

---

## Mobile-First-принципи

1. **Дизайн mobile-first**, потім розширення для desktop
2. **Touch-friendly:** великі tap-target-и, swipe-жести
3. **Оптимізовано під iOS Safari:** без zoom на input-ах (мінімум 16px-шрифт)
4. **Safe-area-и:** поважати notch-і й home-indicator-и
5. **Performance:** мінімізувати layout-shift-и, оптимізувати картинки

---

## Dark-режим

Повна підтримка dark-режиму з теплими підтонами:

```css
.dark {
  --c-bg: 23 20 18; /* #171412 — warm dark */
  --c-panel: 32 28 25; /* #201c19 — elevated surface */
  --c-panel-hi: 48 42 37; /* #302a25 — hover / input */
  --c-line: 82 74 65; /* #524a41 — warm border */
  --c-border-strong: 112 102 90; /* #70665a — prominent divider */
  --c-text: 250 247 241; /* #faf7f1 — warm white */
  --c-muted: 180 174 169; /* #b4aea9 — medium warm gray */
  --c-subtle: 135 128 121; /* #878079 — readable tertiary */
}
```

> Contrast intent: `muted` / `subtle` / `line` були підняті після WCAG-аудиту
> (PR-серія dark-mode contrast lift: [#316](https://github.com/Skords-01/Sergeant/pull/316),
> [#550](https://github.com/Skords-01/Sergeant/pull/550); подальші точкові
> патчі див. у [`archive/dark-mode-audit.md`](./archive/dark-mode-audit.md)). Dark-mode border
> тепер читається на `--c-panel` ≥3:1, а `--c-subtle` забезпечує ≥4.5:1
> на всіх поверхнях.

---

## Посилання й натхнення

### Основні референси

- **Duolingo:** гейміфікація, дружні персонажі, святкові анімації
- **Yazio:** чиста візуалізація health-даних, macro-tracking UI
- **Monobank:** плавні анімації, swipe-жести, мінімалістичний fintech

### Запозичені дизайн-принципи

- Streak-святкування й progress-ring-и Duolingo
- Macro-circle-візуалізації Yazio
- Card-інтеракції й transaction-list-и Monobank

---

## Implementation-нотатки

### Розташування файлів

- **Tailwind-preset (web + mobile):** `packages/design-tokens/tailwind-preset.js`
- **Сирі visual-токени:** `packages/design-tokens/tokens.js`
- **Mobile-only-токени (NativeWind):** `packages/design-tokens/mobile.js`
- **Глобальний CSS (семантичні variable-и):** `apps/web/src/index.css`
- **Chart-тема (series, palette, gradients):** `apps/web/src/shared/charts/chartTheme.ts`
- **UI-примітиви (web):** `apps/web/src/shared/components/ui/`
- **UI-примітиви (mobile):** `apps/mobile/src/components/ui/`

### Ключові компоненти

- `Button` — усі варіанти кнопок
- `Card` — card-контейнери з варіантами
- `ProgressRing` — круглі progress-індикатори
- `Badge` — status-pill-и й тег-и
- `Input` — form-input-и зі стейтами

---

## Native-патерни (iOS / Android)

> **Скоуп:** лише `apps/mobile`. Ця секція є канонічною довідкою патернів
> для mobile (фокус на brand-узгодженій native-поведінці); migration-план
> і фази лежать окремо в [`react-native-migration.md`](../../02-engineering/mobile/react-native-migration.md)
> (рішення Q9 / §13 фіксує, чому native-специфіка живе в брендбуку).
> Токени, палітра, voice, type-scale — web і mobile ділять.

### Safe-area & layout

Використовуй `react-native-safe-area-context` (`useSafeAreaInsets()` /
`SafeAreaView`) на кожному екрані. Ніколи не хардкодить відступи status-bar-а
чи home-indicator-а.

- **Top inset:** поважати на всіх content-екранах. Hero-градієнти й
  full-bleed-медіа можуть заходити під status-bar, але інтерактивний контент
  має починатися нижче `insets.top`.
- **Bottom inset:** завжди поважати у scroll-контейнерах, modal-ах, bottom-sheet-ах
  і sticky-CTA. Primary-дії залишаються над home-indicator-ом.
- **Side-inset-и:** застосовувати на landscape / notched-пристроях; інакше —
  стандартний page-padding.
- **Tab-bar / клавіатура:** поєднувати `insets.bottom` з активною
  tab-bar-висотою; використовувати `KeyboardAvoidingView` (`padding` на iOS,
  `height` на Android) для форм.

### Native-жести

Жести — mobile-еквівалент web-hover-у; це основний спосіб, у який користувачі
сигналізують намір. Увімкнення має бути обдуманим, а для destructive-жестів —
задокументованим.

| Жест             | Де                                                  | Нотатки                                                                           |
| ---------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Swipe-back (iOS) | Усі stack-екрани за промовчанням                    | Вимикати лише на destructive-потоках (delete-wizard, unsaved-edits).              |
| Pull-to-refresh  | Finyk `Transactions`, Routine-календар, Hub-фід     | Використовувати native `RefreshControl`; прив'язувати до React Query-sync модуля. |
| Long-press       | Transaction-row, habit-cell, workout-item           | Відкриває контекстне меню (edit / duplicate / delete).                            |
| Swipe-to-delete  | Finyk `Transactions`, Routine-звички, pantry-item-и | Потребує confirm-кроку для елементів, старших за сьогодні.                        |

Список екранів по модулях, на які це мапується, див. у
[`docs/02-engineering/architecture/platforms.md`](../../02-engineering/architecture/platforms.md).

### Haptics

Використовуй `expo-haptics`. Haptic-и спрацьовують на **намір**, а не на кожний тач —
жодного haptic-спаму, haptic-у на scroll чи hover-еквівалентах.

| Feedback                     | Коли                                                   |
| ---------------------------- | ------------------------------------------------------ |
| `ImpactFeedbackStyle.Light`  | Вибір, toggle, tab-switch, segmented-control           |
| `ImpactFeedbackStyle.Medium` | Успішний save / submit / sync                          |
| `ImpactFeedbackStyle.Heavy`  | Destructive-confirm (delete, reset, disconnect)        |
| `NotificationFeedbackType.*` | Toast із семантичним значенням (success/warning/error) |

```tsx
// У save-button press-handler-і:
await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
await saveTransaction();
```

### Platform-adaptive-типографія

Mobile успадковує type-scale від `@sergeant/design-tokens` (той самий DM Sans,
ті самі розміри). Платформовані відмінності залишаються на рівні OS-accessibility:

- Поважати OS `Dynamic Type` (iOS) і `Font scale` (Android) **до 1.3×**.
  Вище — clamp-имо, щоб зберегти layout карток, ring-ів, таблиць.
- Виставити `maxFontSizeMultiplier={1.3}` на `Text`-примітивах; ввести
  як default на mobile-`Text`-компоненті.
- **Не** бранчувати font-size за `Platform.OS`. Web-типографія не змінюється.

### Dark-режим

Палітра з секції [Dark-режим](#dark-режим) вище — канонічна.
Mobile просто резолвить її з OS-теми:

- Читати `useColorScheme()` з React Native; за промовчанням — за системою.
- Ті самі token-імена, що й в web (`--c-bg`, `--c-panel`, `--c-text`, …) —
  відрізняються лише резолвлені значення, обробляються всередині `@sergeant/design-tokens`.
- Дозволити per-user-override у `HubSettings` (system / light / dark),
  збережений у MMKV.

### Motion

Використовуй `react-native-reanimated` v3 для всіх нетривіальних анімацій.
Тривалості узгоджені зі web-шкалою:

- **150 ms** — мікро (toggle, press-in, tab-switch). Відповідає web-«fast».
- **250 ms** — page / screen-transition-и. Відповідає web-«default».
- **400 ms** — modal-и й bottom-sheet-и (enter); dismiss — ~250 ms.
- Default easing — `easeOutQuad`-подібний (`Easing.out(Easing.quad)`);
  Duolingo-style-bounce «pop» лишається для святкових моментів.
- Поважати OS-**Reduce Motion** через `useReducedMotion()` — вимикати
  non-essential-анімацію (parallax, stagger, success-pulse), лишати лише
  функціональні transition-и (наприклад, sheet-відкриття/закриття) з зменшеною амплітудою.

### Іконки

- **Навігація & tab-и:** platform-idiomatic-набір через `@expo/vector-icons`
  (Apple HIG на iOS, Material на Android), щоб tab-bar відчувався native.
- **Content-іконки:** Lucide (як в web), щоб module-surface-и були
  візуально консистентними на платформах.
- Правила stroke/розміру з секції [Іконки](#іконки) вище — зберігати.

### Заборонено на mobile

Web-патерни, які не перекладаються — не переносити їх у `apps/mobile`:

- **Hover-states** — замість них press-in / focus.
- **Desktop-keyboard-шорткати** — жодних `⌘K`, жодних глобальних hotkey-ів.
- **Right-click / context-menu** — замінити long-press-контекстним меню.
- **`position: fixed`-floating-панелі** — замінити bottom-sheet-ами
  (`@gorhom/bottom-sheet` або native `Modal`).
- **Tooltip-и на hover** — якщо інфо важлива, зробити tap-target-ом
  з inline-hint-ом; інакше — викинути.

---

_Цей brandbook — living document. Оновлюй у міру розвитку дизайн-системи._
