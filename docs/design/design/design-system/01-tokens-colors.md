# Design System — Принципи та Кольорові токени

> **Last validated:** 2026-09-16 by @claude (звірено з `tokens.js` / `theme.css`: стіл і зона, ink-тири статусів і акцентів, chartPalette, v2 namespace → Reference). **Next review:** 2027-02-26.
> **Status:** Active (v2 redesign foundation merged 2026-05; brand palette → stone via 2026-07 M1)

Цей документ охоплює базові принципи дизайн-системи, кольорові токени та WCAG AA контраст.

Повний index → [`../design-system.md`](../design-system.md).

---

## 1. Принципи

1. **Семантичні токени → Tailwind-утиліти → примітиви.** Ніяких hex-кодів в
   `className` (`bg-[#10b981]`, `text-[#fff]/50` — дизайн-конвенція:
   tokens + review, ex-Hard Rule #11, retired
   [ADR-0081](../../../governance/adr/0081-repository-simplification.md)).
   Якщо потрібен новий колір — додай його
   у `packages/design-tokens/tailwind-preset.js` разом із
   `-soft` / `-strong` компаньйонами, не inline в компонент.
2. **Темна тема — first-class.** Всі токени живуть у CSS-змінних
   `:root` та `.dark`; теми перемикаються класом без перезапису стилів.
   Парні `dark:` override з сирою палітрою (`bg-teal-100 dark:bg-teal-900/30`)
   — заборонений анти-патерн. [`archive/dark-mode-audit.md`](https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/05-design/design/archive/dark-mode-audit.md)
   збережений як історія міграції; поточний guardrail — дизайн-конвенція,
   що тримається tokens + review (ex-Hard Rule #13, retired ADR-0081).
3. **Модулі діляться токенами, а не стилями.** `bg-finyk-surface`,
   `text-fizruk`, `border-routine/30` — це семантичні аксенти; вся базова
   типографіка, spacing, радіуси одні для всіх. Всередині
   `apps/<app>/src/modules/<X>/` дозволені лише акценти модуля `<X>` —
   дизайн-конвенція module-accent containment (tokens + review,
   ex-Hard Rule #12, retired ADR-0081) + [`module-accent.md`](../module-accent.md).
4. **Accessibility не опція.** Клавіатурний фокус завжди видимий
   (`focus-visible:ring-2 ring-focus/45 ring-offset-2 ring-offset-bg`),
   touch-targets ≥44×44 px, контраст ≥4.5:1 для тексту, ≥3:1 для
   UI-елементів (WCAG AA). Дизайн-конвенція — `focus:` для viz-стилів
   заборонений, тільки `focus-visible:`.
5. **Мобільний first.** Базові пропси розраховані на 375px; планшет
   (768px) отримує додатковий breakpoint.

---

## 2. Кольорові токени

### 2.1 Семантичні поверхні

| Token            | Роль                                | Light     | Dark      |
| ---------------- | ----------------------------------- | --------- | --------- |
| `bg` / `bg-bg`   | Фон сторінки                        | `#ecebe7` | `#14100e` |
| `surface`        | Картки, панелі                      | `#ffffff` | `#2a231f` |
| `surface-muted`  | Інпути, hover, допоміжні поверхні   | `#f6f5f2` | `#3a302b` |
| `surface-strong` | Стек сторінки під модалкою          | = `bg`    | = `bg`    |
| `border`         | Розмежувачі, обводки картки         | `#e2e0da` | `#48423e` |
| `border-strong`  | Сильніший дільник (інпути, таблиці) | `#ddd3c5` | `#595350` |

Back-compat: старі токени `panel` / `panelHi` / `line` продовжують працювати.

Фон сторінки під `bg` у модулі — **стіл** `--module-desk-rgb` (hue модуля,
хрома ≤5%), шапка й таби — **зона** `--module-zone-rgb` (з 2026-09-03;
джерело `moduleSurfaces` у `tokens.js`, класи `.bg-mesh` / `.bg-zone` /
`.zone-chip`). Хаб нейтральний. Розбір —
[`03-spacing-elevation-theming.md § 8.5`](./03-spacing-elevation-theming.md#85-стіл-і-зона-фон-у-hue-модуля).

> **Оновлено 2026-09-12.** Обидві колонки були на генерацію позаду: таблиця
> несла `#fdf9f3 / #201c19` — світлу базу до рішення власника Б1 (2026-08-07)
> і темну до «Чорнила» (2026-08-05). Значення тепер узяті з `:root` і `.dark`
> у [`apps/web/src/styles/theme.css`](../../../../apps/web/src/styles/theme.css),
> які дзеркалять `inkTheme.surface` у `packages/design-tokens/tokens.js`.
>
> **Мобайл має ВЛАСНУ темну тему, і це рішення, а не борг (власник,
> 2026-09-12).** [`apps/mobile/global.css`](../../../../apps/mobile/global.css)
> несе `#171412 / #201c19 / #302a25`; значення в таблиці вище стосуються
> **тільки веба**. Контраст у мобайлі тримає AA з запасом (найтісніше
> `subtle` 4.61:1 і `danger-ink` 5.12:1 на `panel-hi`), тож розбіжність
> візуальна, не доступнісна. Раніше це було записано як «не проведена
> міграція» — після кроку 2 D1 власник закрив питання: дві поверхні
> лишаються двома темами. Drift-гейту мобайл↔токени немає навмисно;
> завести його треба буде лише разом із рішенням про міграцію.

### 2.2 Текст

| Token    | Роль                                | Light               | Dark      |
| -------- | ----------------------------------- | ------------------- | --------- |
| `text`   | Заголовки, основний текст           | `#0f1713`           | `#f2f6f2` |
| `muted`  | Секундарний текст, мітки            | `#535c56`           | `#a3aea6` |
| `subtle` | Третинний текст, плейсхолдери       | `#605a54`           | `#98a49c` |
| `fg-*`   | Семантичні аліаси (prefer new code) | = text/muted/subtle |

### 2.3 Бренд і модулі

> **Хаб — нейтральний батько (2026-07 design-audit M1).** `brand` — це
> ідентичність hub / shell, і вона **свідомо безбарвна** (warm-stone ramp).
> Раніше `brand` аліасив teal, через що shell був невідрізнюваний від finyk і
> фактично ставав п'ятим акцентом. Тепер shell тихий — рівно один module-accent
> читається на екрані. `brand` **не** module-color: ніколи не вживай його як
> акцент модуля (дизайн-конвенція). Клавіатурний фокус — **окрема** підсистема:
> лишається teal через `--c-ring`, тож decoupling `brand` від teal не гасить
> focus-індикатор. Повна історія палітри — §2.6.

| Token          | Hex (light)           | Використання                                                          |
| -------------- | --------------------- | --------------------------------------------------------------------- |
| `brand`        | `#44403c` (stone-700) | Hub / shell текст+іконки, нейтральний primary CTA (`bg-brand-strong`) |
| `brand-strong` | `#292524` (stone-800) | Solid-заливки з `text-white` (~14:1)                                  |
| `accent`       | `#0f766e` (teal-700)  | Семантичний акцент + focus ring (`--c-accent` / `--c-ring`)           |
| `finyk`        | `#0f766e` (teal-700)  | ФІНІК — гроші, баланси (2026-07: було emerald `#10b981`)              |
| `fizruk`       | `#0e7490` (cyan-700)  | ФІЗРУК — тренування (v2 redesign 2026-05; було teal-500)              |
| `routine`      | `#eb7691` (rose-500)  | Рутина — звички, трояндові                                            |
| `nutrition`    | `#92cc17` (lime-500)  | Харчування — ліма                                                     |

Для кожного модуля доступні градаційні шкали `-50`…`-900` + hero-поверхні:
`bg-finyk-surface`, `bg-fizruk-surface`, `bg-routine-surface`,
`bg-nutrition-surface` (світла тінт поверхня під hero-картку модуля).

> **`brand` vs `accent` — не плутати.** `brand` = нейтральний stone (hub
> chrome); `accent` = teal-700 (`--c-accent`) для focus-ring/CTA-highlight, які
> НЕ належать конкретному модулю. Це різні токени з 2026-07 — до M1 обидва
> вказували на один emerald. Джерело істини — `packages/design-tokens/tokens.js`
> (`brandColors.stone` / `brandColors.teal`) + `apps/web/src/styles/theme.css`
> (`--c-accent`, `--c-ring`).

> **`accent-strong`-alias.** `accent-strong` (вживане в audit-документах і
> module-accent контракті) — це alias на `brand-strong` (`#292524`, stone-800,
> ≥4.5:1 проти `text-white`). Окремого CSS-змінного `--c-accent-strong` нема —
> WCAG-AA-companion живе під канонічною назвою `bg-brand-strong` /
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

**Текст статусу і акценту — окремий тир на тему** (`tokens.js`):

| Тир                       | Світла (`-800`, заливка під `text-white` і текст)                                                          | Темна — ink-текст (`-400`, `--c-{x}-ink`)                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| статуси `statusStrongHex` | success `#065f46` · warning `#92400e` · danger `#991b1b` · info `#075985`                                  | `statusInkHex`: success `#34d399` · warning `#fbbf24` · danger `#f87171` · info `#38bdf8`                                  |
| акценти `accentStrongHex` | brand `#292524` (stone-800) · finyk `#115e59` · fizruk `#155e75` · routine `#8d4256` · nutrition `#466212` | `accentInkHex`: brand `#d6d3d1` (stone-300) · finyk `#2dd4bf` · fizruk `#22d3ee` · routine `#f68da4` · nutrition `#b0e636` |

`text-{status}-strong` / `text-{accent}-strong` у темній темі резолвляться в
ink-тир через CSS-змінну, а не через ручні `dark:`-пари (2026-08-21 для
статусів, 2026-09-02 для акцентів — ручні пари мовчки пропускали третину
місць). Найтісніша пара — `danger`-ink на `surfaceHi` (4.64:1) — саме вона
тримає стелю глибини темної теми.

Окрема п'ята родина — **кольори категорій витрат Фініка** `categoryColors`
(18 ключів у `tokens.js`, включно з `other` і спільним `income`), свідомо
розведена по hue з модульними акцентами; гейт
`categoryColors.contract.test.js`, правити через
`packages/design-tokens/categoryColors.gen.js`. Таблиця — у
[`DESIGN.md`](../../../../DESIGN.md) (AUTOGEN-блок `palette`).

### 2.5 Data-viz (графіки)

Канонічний набір у `apps/web/src/shared/charts/chartTheme.ts`:

- `chartSeries.finyk / .fizruk / .routine / .nutrition` — бренд-акценти
  серій для модуля (primary + secondary + surface).
- `chartPaletteList` — 8-кольорова гармонійна палітра для pie/категорій.
- `chartAxis` / `chartGrid` / `chartTick` — спільні Tailwind-класи
  для осей, сітки, тіків.
- `chartGradients.finyk` тощо — пари stop'ів для area-fill градієнтів.

> Не імпортуй hex із `chartPalette` (`packages/design-tokens/tokens.js`,
> окремого `chartPalette.js` немає) напряму в компонент — бери через
> `chartTheme.ts`, аби міграція палітри в майбутньому вимагала одного
> файлу.

### 2.6 Версії дизайн-мови (палітра)

Sergeant пережив дві brand-міграції. Легасі-документи, коментарі та код-снепшоти
можуть посилатися на старіші назви — **завжди довіряй поточному рядку таблиці
нижче**, а не історичним згадкам emerald.

| Ера                              | Що змінилось                                                                                                                                                                                                                                                                                                                                                | Стан                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **v1 — emerald** (до 2026-05)    | Один `brand` = emerald `#10b981`; він же focus ring, CTA і акцент finyk. Модулі ще не мали окремих hue — усе «зелене».                                                                                                                                                                                                                                      | Superseded                                       |
| **v2 namespace** (2026-05)       | Parallel v2 token namespace (glass, mesh, ink-strong, Manrope). Введено окремий **fizruk = cyan-700** (розчепив fizruk від teal). Legacy `--c-*` лишились активні. Redesign-v2 закрито 2026-05-21; `--surface-*-glass` — back-compat аліаси на непрозору ink-поверхню (`theme.css`, `.dark`), `.bg-mesh` малює плоский стіл — свічення прибрано 2026-09-03. | Reference (deprecated; Manrope і cyan-700 чинні) |
| **M1 — stone rebrand** (2026-07) | `brand` decoupled від teal → нейтральний **stone** (hub — тихий батько). `finyk` перейшов emerald → **teal-700**. Focus ring лишився teal через окремий `--c-ring`. Чотири модулі: finyk teal · fizruk cyan · routine coral · nutrition lime.                                                                                                               | Superseded (routine → rose, 2026-08-07)          |

**Практичний висновок для контриб'ютора:**

- Новий CTA у hub / shell → нейтральний `bg-brand-strong` (stone), **не** emerald/teal.
- Focus ring → `ring-focus` (teal `--c-ring`; усередині модуля автоматично стає module-accent).
- `finyk` — це **teal**, не emerald. Будь-який emerald у новому коді — червоний прапор
  (лишився лише в `chartPalette[1]` як data-viz-стоп, не як brand).
- Джерела істини: `packages/design-tokens/tokens.js` (`brandColors`),
  `packages/design-tokens/tailwind-preset.js` (semantic map), `theme.css` (CSS-змінні).

Governance-trace міграцій: [`redesign-v2/`](../redesign-v2/README.md) (v2 namespace) +
[`design-consistency-audit-2026-07.md`](../design-consistency-audit-2026-07.md) (M1 stone cleanup).

---

## 9. WCAG AA контраст

| Пара                               | Ratio    | Статус |
| ---------------------------------- | -------- | ------ |
| `text` on `surface` (light)        | 18.2 : 1 | AAA ✓  |
| `muted` on `surface` (light)       | 6.9 : 1  | AA ✓   |
| `subtle` on `surface` (light)      | 6.8 : 1  | AA ✓   |
| `text` on `surface` (dark)         | 14.2 : 1 | AAA ✓  |
| `muted` on `surface` (dark)        | 6.7 : 1  | AA ✓   |
| `subtle` on `surface` (dark)       | 6.0 : 1  | AA ✓   |
| `muted` on `surface-muted` (dark)  | 5.6 : 1  | AA ✓   |
| `subtle` on `surface-muted` (dark) | 5.0 : 1  | AA ✓   |
| `brand-strong` white text          | 15.2 : 1 | AAA ✓  |
| `finyk` white text                 | 7.6 : 1  | AA ✓   |
| `fizruk` white text                | 7.3 : 1  | AA ✓   |
| `routine` white text               | 6.9 : 1  | AA ✓   |
| `nutrition` white text             | 7.0 : 1  | AA ✓   |
| `danger` white text                | 8.3 : 1  | AA ✓   |

> `brand-strong` = stone-800 (`#292524`) — з M1 rebrand hub-primary нейтральний
> і проходить AAA навіть для body-тексту. Модульні рядки — для поточних акцентів
> (finyk teal · fizruk cyan · routine **rose** · nutrition lime), не для legacy emerald
> і не для коралу (рампа Рутини замінена 2026-08-07).

> **Перезаміряно 2026-09-12 (D1 крок 2).** Уся таблиця була на генерацію
> позаду, і не лише в темній колонці: модульні рядки несли числа тира **-700**
> (3.1-3.9 : 1), хоч заливки під білим текстом переведені на **-800** ще
> 2026-08-07, а `subtle` у світлій темі стояв 2.9 : 1 із позначкою
> «< AA (декор)» при фактичних 6.8 : 1 — тобто **обмеження в «Виводах» нижче
> спиралися на числа, яких система вже не мала**. Це той самий дефект, що
> D1 крок 1 знайшов у `tokens.js`: задокументоване число гейта не має, тож
> воно переживає зміну значення мовчки. Числа тут пораховані скриптом із
> чинних токенів; додано рядки `subtle` (dark) і обидві пари на
> `surface-muted`, яких у таблиці не було взагалі.

Виводи:

1. `subtle` — повноцінний інформативний тир: 6.8 : 1 у світлій, 6.0 : 1 у
   темній, і **гейтований на 4.5 на всіх трьох поверхнях** обох тем
   (`theme.softContrast.test.ts`). Обмеження «тільки декоративне» знято
   рішенням власника 2026-08-21 — до нього токен справді давав 2.9 : 1 і був
   підписаний «labels ≥12px only», але то посилання на послаблення WCAG,
   якого для 12px не існує (3 : 1 діє від 18.66px bold / 24px regular).
2. **Заливка під білим текстом залежить від тира, і тири розійшлись.**
   `-strong` (тир -800) проходить **повний AA** для всіх чотирьох модулів
   (6.9-7.6 : 1) — обмеження «тільки ≥18 px» стосувалося тира -700, на
   якому ті 3.1-3.9 : 1 і міряли; заливки переведені на -800 2026-08-07
   разом зі статусними, щоб у системі був один тир (розбір —
   `statusStrongHex` у `tokens.js`).
   А DEFAULT-тир `moduleColors.*.primary` під білим **сам мішаний**, і це
   знахідка, не конвенція: finyk `#0f766e` дає 5.47 і fizruk `#0e7490` —
   5.36 (повний AA), але routine `#eb7691` дає **2.79** і nutrition
   `#92cc17` — **1.93**, тобто провал навіть для large-text. Причина в
   тому, що перші два — тир -700, а другі два — **-500**. Отже `bg-{module}`
   під `text-white` без `-strong` безпечний лише для finyk і fizruk;
   для routine та nutrition — ні за яких розмірів. Зведення
   `moduleColors.primary` в один тир — окреме рішення, тут не робилось.
