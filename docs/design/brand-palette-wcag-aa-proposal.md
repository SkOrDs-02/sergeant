# Brand-палітра → WCAG AA — пропозиція

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.

> **Status:** Proposal. Цей PR не змінює жодного токена — документ є дизайн-контрактом,
> якому слідуватиме implementation-PR.
>
> **Last reviewed:** 2026-04-26. Reviewer: @Skords-01
>
> **Драйвер:** PR [#851](https://github.com/Skords-01/Sergeant/pull/851)
> викинув `/design` (DesignShowcase) зі списку axe-core SURFACES; PR
> [#852](https://github.com/Skords-01/Sergeant/pull/852) прибрав чотири з п’яти
> родин правил, які падали. Що залишилося — `color-contrast` (60 nodes, serious),
> властивий самій brand-палітрі, і є предметом цієї пропозиції.
> Його виправлення ре-вмикає `/design` у axe-core-гейті.
>
> **Поза скоупом:** chart-палітри, типографія, motion, dark-mode-робота
> (dark-тема вже пройшла audit наприкінці 2025 — див.
> [`docs/design/BRANDBOOK.md`](./BRANDBOOK.md#dark-mode)).

---

## TL;DR

Brand-палітра Sergeant використовує мід-сатураційні зелені (`emerald-500`,
`teal-500`, `lime-500`), теплий coral (`coral-500`) і amber (`amber-500`)
**як** background-fill, **так** і text-color. Усі вони провалюють WCAG 2.1 AA
на 14 px regular / 18 px bold:

| Token                         | Hex       |    On `text-white` | On `bg-bg` (`#fdf9f3`) |
| ----------------------------- | --------- | -----------------: | ---------------------: |
| `brand` / `success` / `finyk` | `#10b981` |     **2.54 : 1** ✗ |         **2.42 : 1** ✗ |
| `fizruk`                      | `#14b8a6` |     **2.49 : 1** ✗ |         **2.37 : 1** ✗ |
| `nutrition`                   | `#92cc17` |     **1.93 : 1** ✗ |         **1.84 : 1** ✗ |
| `routine`                     | `#f97066` |     **2.79 : 1** ✗ |         **2.66 : 1** ✗ |
| `warning`                     | `#f59e0b` |         2.15 : 1 ✗ |                      — |
| `info`                        | `#0ea5e9` |         2.77 : 1 ✗ |         **2.64 : 1** ✗ |
| `danger`                      | `#ef4444` |     **3.76 : 1** ✗ |             3.59 : 1 ✗ |
|                               |           | **req: ≥ 4.5 : 1** |                        |

(Усі співвідношення обчислені за luminance-формулою WCAG 2.1 § 1.4.3 — тією
ж, що використовує axe-core. Cross-check проти
[WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/).)

Пропозиція — **не** перетюнити саму brand-палітру (це зламає візуальну
ідентичність і рік marketing-asset-ів). Натомість — формалізувати two-token-tier
на кожен brand-колір:

- **brand-колір** (як є сьогодні) — `bg-{brand}`, decorative-fill-и, іконки,
  large-text-заголовки (≥ 18 px bold).
- **`-strong`-companion** — `text-{brand}-strong`, `bg-{brand}-strong`,
  WCAG-AA-пара, використовується всюди, де brand-колір виступає як
  _body-сизний текст_ або як saturated-solid під `text-white`.

Scaffolding `-strong` уже є для чотирьох module-кольорів
(`text-finyk-strong`, `text-fizruk-strong`, `text-routine-strong`,
`text-nutrition-strong` — див.
[`packages/design-tokens/tailwind-preset.js`](../../packages/design-tokens/tailwind-preset.js)).
Ця пропозиція розширює ту саму конвенцію на `brand` / `success` /
`warning` / `danger` / `info` / `accent`, кодифікує _коли_ використовувати
який, і лінтить порушення новим ESLint-правилом.

---

## 1. Опис проблеми

### 1.1 Що axe фає на `/design`

Після PR #852 `/design` репортить рівно одне axe-правило:

```
[serious] color-contrast: 60 node(s)
TOTAL: 1 unique rule
```

Категоризація цих 60 нодів:

| Патерн                                                                | Приклад token-комбінації     | Ноди |
| --------------------------------------------------------------------- | ---------------------------- | ---: |
| Saturated-solid + `text-white` (Button-и, solid-Badge-і, solid-Tab-и) | `bg-brand text-white`        |  ~24 |
| Brand-кольоровий _текст_ на page-surface (`bg-bg` cream)              | `text-finyk` on `#fdf9f3`    |  ~22 |
| Soft-pill: tinted-bg + brand-fg (`bg-{c}-soft text-{c}`)              | `bg-danger-soft text-danger` |  ~10 |
| Statistic-номери в module-color                                       | `text-success` 24 px bold    |   ~4 |

Ці чотири патерни є 1:1 відображенням чотирьох примітивів, які складають
майже кожен екран: **Button (solid)**, **Badge (solid + soft)**,
**Tab-и (pill-стиль)**, **Stat / numeric-callout-и**.

### 1.2 Чому є цей розрив

Палітра в
[`packages/design-tokens/tokens.js`](../../packages/design-tokens/tokens.js)
була налаштована під візуальну гармонію, натхнення Duolingo / Yazio / Monobank —
ці продукти спираються на `-500`-степ так само, як Sergeant, але
послідовно парують його з **bold ≥ 18 px**-copy або з темнішою text-on-color-
парою, яку ми зараз не виводимо як Tailwind-utility.

[`docs/design/BRANDBOOK.md` § Color Contrast](./BRANDBOOK.md#color-contrast)
вже формулює правило (`Text on backgrounds: Minimum 4.5:1 ratio`) —
але _токени_ його не несуть. Нема lint-у чи тесту, який в’язав би писане
правило з випущеними utility-класами. Тому на практиці правило дрейфувало
~12 місяців.

### 1.3 Що «фікс палітри» НЕ повинен зламати

- **Візуальну ідентичність.** Emerald / teal / coral / lime-пара є на
  splash-екрані, App Store-скріншотах, marketing-сайті, Capacitor-shell-
  іконці, weekly-digest-email-ах. Зміна `-500`-hex ламає все це.
- **Snapshot-тести.** [`packages/design-tokens/tokens.test.js`](../../packages/design-tokens/tokens.test.js)
  пінить форму `brandColors` і `statusColors` через Jest-snapshot-и; mobile
  споживає ту саму flat-hex-map. Будь-яка зміна в `tokens.js` поширюється
  на `apps/mobile`, `apps/mobile-shell` і канонічний web-SPA.
- **Наявну dark-mode-роботу.** Dark-тема пройшла audit (див. примітку в
  BRANDBOOK). Не регресувати її, поки підвищуємо light-контраст.

Отже, форма обмеження — **додавати токени, не мутувати**.

---

## 2. Пропозиція

### 2.1 Додати `-strong`-text/fill-тір для кожного brand-кольору

Чотири module-кольори вже мають поле `strong` у блоці `semanticVariants` в
[`tailwind-preset.js`](../../packages/design-tokens/tailwind-preset.js)
(рядки 119–124 для `finyk`, ідентичний патерн для решти). Сьогодні вони
заповнені `brandColors.{family}[700]` для `finyk` / `fizruk` / `routine`
і `brandColors.lime[800]` для `nutrition` (lime-700 давав занадто тонкий
запас проти кремового `bg-bg`, див. § 2.1 нижче), і виведені як
`text-finyk-strong` тощо. Використовуються в soft-Badge-варіантах
(`bg-finyk-soft text-finyk-strong border-finyk-ring/50`) і в `StatCard`-заголовках.

Розширити конвенцію на решту шісти токенів:

```js
// packages/design-tokens/tailwind-preset.js — proposed addition
brand: {
  DEFAULT: brandColors.emerald[500], //   #10b981
  strong:  brandColors.emerald[700], //   #047857   — text on cream
  light:   brandColors.emerald[400],
  dark:    brandColors.emerald[600],
  subtle:  brandColors.emerald[50],
  soft:    "rgb(var(--c-success-soft) / <alpha-value>)", // #d1fae5
  ...brandColors.emerald,
},

success:        statusColors.success,           // unchanged: #10b981
"success-strong": brandColors.emerald[700],     // NEW: #047857
"success-soft":   "rgb(var(--c-success-soft) / <alpha-value>)",
"success-on":     "#ffffff",                    // NEW: paired text-on-fill

warning:        statusColors.warning,           // unchanged: #f59e0b
"warning-strong": "#b45309",                    // NEW: amber-700
"warning-soft":   "rgb(var(--c-warning-soft) / <alpha-value>)",
"warning-on":     "#ffffff",                    // text-on-fill paired with -strong

// danger / info / accent: same shape
```

Обчислений контраст на 14 px regular проти кремового `--c-bg`
(`#fdf9f3`):

| Token                   | Hex                     | Ratio на `bg-bg` | WCAG AA 14 px |
| ----------------------- | ----------------------- | ---------------: | ------------- |
| `text-success-strong`   | `#047857` (emerald-700) |     **5.23 : 1** | ✓ Pass        |
| `text-fizruk-strong`    | `#0f766e` (teal-700)    |     **5.22 : 1** | ✓ Pass        |
| `text-routine-strong`   | `#c23a3a` (coral-700)   |     **5.06 : 1** | ✓ Pass        |
| `text-nutrition-strong` | `#466212` (lime-800)    |     **6.64 : 1** | ✓ Pass        |
| `text-warning-strong`   | `#b45309` (amber-700)   |     **4.83 : 1** | ✓ Pass        |
| `text-danger-strong`    | `#b91c1c` (red-700)     |     **6.17 : 1** | ✓ Pass        |
| `text-info-strong`      | `#0369a1` (sky-700)     |     **5.66 : 1** | ✓ Pass        |

А `text-white` проти відповідного `bg-{c}-strong`-solid — друга половина
симетричної пари, використовується в solid-тонах `Button` / `Badge`:

| Pair                                              |        Ratio | WCAG AA 14 px |
| ------------------------------------------------- | -----------: | ------------- |
| `text-white` on `bg-success-strong` (emerald-700) | **5.48 : 1** | ✓ Pass        |
| `text-white` on `bg-fizruk-strong` (teal-700)     | **5.47 : 1** | ✓ Pass        |
| `text-white` on `bg-routine-strong` (coral-700)   | **5.30 : 1** | ✓ Pass        |
| `text-white` on `bg-nutrition-strong` (lime-800)  | **6.96 : 1** | ✓ Pass        |
| `text-white` on `bg-warning-strong` (amber-700)   | **5.02 : 1** | ✓ Pass        |
| `text-white` on `bg-danger-strong` (red-700)      | **6.47 : 1** | ✓ Pass        |
| `text-white` on `bg-info-strong` (sky-700)        | **5.93 : 1** | ✓ Pass        |

Усі сім `-strong`-токенів комфортно лежать над порогом 4.5 : 1.
`nutrition-strong` — єдина родина, що _не_ `[700]`: наявний preset уже підняв
її до `lime-800` (`#466212`), тому що `lime-700` (`#567c0f`) дає лише 4.67 : 1
на кремі — нижче запасу 5–6 : 1, який мають інші модулі. Implementation-PR
_зберігає_ вибір lime-800 як є. Решта шістьох токенів (success /
warning / danger / info / brand / accent) слідує конвенції `[700]`.
Numeric-callout-и (≥24 px bold) проходять WCAG-AA-large-text-правило 3 : 1
на будь-якому з цих тірів.

### 2.2 Правила використання на рівні компонентів

| Компонент              | Тон                                 | Сьогодні                                                                      | Пропонується                            |
| ---------------------- | ----------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------- |
| `Button`               | `solid`                             | `bg-{c} text-white`                                                           | `bg-{c}-strong text-white` (≥4.5:1)     |
| `Button`               | `soft`                              | вже `bg-{c}-soft text-{c}` ✗                                                  | `bg-{c}-soft text-{c}-strong` ✓         |
| `Button`               | `outline`                           | `border-{c} text-{c}` ✗                                                       | `border-{c} text-{c}-strong` ✓          |
| `Badge`                | `solid`                             | `bg-{c} text-white` ✗                                                         | `bg-{c}-strong text-white` ✓            |
| `Badge`                | `soft`                              | вже `text-{c}-strong` для module-варіантів; `text-{c}` для status-варіантів ✗ | уніфікувати на `text-{c}-strong` ✓      |
| `Badge`                | `outline`                           | `border-{c}/60 text-{c}` ✗                                                    | `border-{c}/60 text-{c}-strong` ✓       |
| `Tabs`                 | `pill` active                       | `bg-{c} text-white` ✗                                                         | `bg-{c}-strong text-white` ✓            |
| `Tabs`                 | `pill` active text-only (underline) | `text-{c}` ✗                                                                  | `text-{c}-strong` ✓                     |
| `Banner`               | `success` / `warning` / `danger`    | (виправлено в #852)                                                           | без змін                                |
| `StatCard`             | numeric headline (≥ 18 px **bold**) | `text-{c}`                                                                    | **залишити** — проходить large-text 3:1 |
| `Icon`-гліфи (≥ 24 px) | decorative                          | `text-{c}`                                                                    | **залишити** — non-text-element         |

Рядки «залишити» важливі: WCAG-**non-text-element**-клоз (3:1) і
**large-text**-клоз (3:1 на 24 px / 18.66 px bold) дозволяють brand-колір
на повній сатурації. Пропозиція зберігає brand-колір там, де він візуально
виграє, а контраст-спек дозволяє; `-strong` вводиться лише на
_body-text_-розмірах, де AA провалюється.

### 2.3 План міграції (по одному PR по порядку)

1. **`design-tokens`-PR** — додати `*-strong` і `*-soft`-ключі в
   `tailwind-preset.js`, зареєструвати нові utility-імена в allow-list-і
   `packages/eslint-plugin-sergeant-design`, регенерувати
   `tokens.test.js.snap`, задокументувати в `BRANDBOOK.md`. **Без змін
   у consumer-ів.** Visual diff: нуль, бо ніхто ще не використовує нові
   токени.
2. **`web`-PR — примітиви** — перемкнути solid/soft/outline-варіанти
   `Button`, `Badge`, `Tabs` на `-strong`. `pnpm vitest` у
   `apps/web/src/shared/components/ui` — регресійна павутина.
3. **`web`-PR — повернення `/design`** — додати `/design` у
   `apps/web/tests/a11y/axe.spec.ts` `SURFACES`. Викинути багаторядковий
   док-коментар «intentionally NOT in this list» на користь однорядкової
   примітки (`/design` знову гейтить примітиви на рівні showcase — той ж
   намір, що в коміті `8e9d8833`).
4. **`mobile`-PR** — віддзеркалити ті ж `-strong`-пари в NativeWind-preset
   (mobile.js споживає ті ж `brandColors`; потрібен еквівалентний
   flat-hex-export). Прогнати snapshot-тести `apps/mobile`.
5. **`docs`-PR** — розширити `BRANDBOOK.md § Color Contrast` таблицею
   вище й decision-matrix «коли використовувати `-strong` vs `-DEFAULT`».

Кроки 1–3 мерджаться незалежно від 4–5 і відразу розблоковують
`/design`-axe-гейт. Кроки 4–5 закривають луп cross-platform-паритету.

### 2.4 Edge-case `warning` (і чому він залишається симетричним)

Перший інстинкт на `warning` — зламати симетрію `bg-{c}-strong text-white`
і використати пару _темний текст на amber-500_ (Apple-/Material-патерн).
Числа ж кажуть «ні» — amber-500 не підходить для body-text:

- `bg-warning text-white` (`#f59e0b` + white) → **2.15 : 1** ✗
- `bg-warning text-amber-900` (`#f59e0b` + `#78350f`) → **4.22 : 1** ✗ (все ще нижче AA body)
- `bg-warning text-amber-950` (`#f59e0b` + `#451a03`) → 6.97 : 1 ✓, але
  візуально майже чорний-на-amber, виглядає зламаним

Проти симетричного `-strong`-solid:

- `bg-warning-strong text-white` (`#b45309` + white) → **5.02 : 1** ✓

Отже, пропозиція _зберігає_ симетричний патерн: warning-solid-и є
`bg-warning-strong text-white` (amber-700 + white) — той самий схемний
патерн, що в решти шісти токенів. Де _amber-500_-fill критично потрібен
(наприклад, decorative-tag-блок, iOS-style-status-індикатор), обмежити
його large-text (≥18.66 px bold), де вступає large-text-правило 3 : 1 —
той самий виняток, який уже регулює numeric-callout-и `StatCard`.

### 2.5 Lint-енфорсмент

Додати ESLint-правило `sergeant-design/no-low-contrast-text-on-fill`
(або розширити `valid-tailwind-opacity`), яке фає class-стрінги
`bg-{c} text-white`, де `{c}` — один із семи brand- / status-ключів, і
пропонує `bg-{c}-strong text-white` (або `text-{c}-strong` для warning-кейсу).
Правило — `warn` на час між-PR-міграції, потім піднімається до `error`
після кроку 3.

Доповнювальний lint або visual-regression-чек можна додати в
`apps/web/src/shared/components/ui/*.test.tsx`, щоб primitive-snapshot-и
падали, якщо saturated `bg-{c}` знову з’явиться з body-сизним текстом.

---

## 3. Чому не альтернатива X?

**Перетюнити саму brand-палітру.** Розглянуто й відхилено — див.
§ 1.3. Візуальна ідентичність занадто широко розповсюджена, і рік
маркетингових асетів мусив би йти слідом.

**Додати лише `forcedColors`-/`prefers-contrast: more`-override.**
Це вирішує WCAG AA лише для користувачів, які _opt-in_-ять через
OS-level-high-contrast-преференс. Не поправляє default-рендерингу,
не задовольняє axe в CI і не допомагає медіанному користувачу.

**Підняти font-weight до `bold` на кожному saturated-solid.** WCAG AA
послабляється до 3 : 1 лише при ≥ 18.66 px bold. Button-и/badge-і є
типово 12–14 px — переведення на bold піднімає baseline-контраст ледь-
ледь, але не проводить AA, і візуально «кричить» на малих pill-ах.

**Опустити сатурацію по всій палітрі («muted»-rebrand).** Це _є_
альтернатива, якщо дизайн-тим хоче переглянути бренд. Розмова більша;
ця пропозиція — мінімально-руйнівний шлях, що узгоджує WCAG AA з наявною
ідентичністю.

---

## 4. Відкриті питання

1. **Чи `text-white` на `bg-{c}-strong` має стати default для `solid`-Button-
   тону, чи вивести обидва — `solid` (mid-sat, візуально яскравий,
   large-text-only) і `solid-strong` (AA-safe, body-text)?**
   Рекомендація: лише один — `solid = bg-strong + text-white`,
   відповідає тому, як решта дизайн-системи мапить «solid» на
   «high-emphasis». Дизайнери, які хочуть яскравіший відтінок, можуть
   вживати `bg-{c}` напряму з код-коментарем.
2. **Токен `accent`.** `accent = #10b981` сьогодні (alias-`success`).
   Чи має він перейти на окремий відтінок (наприклад, `violet-500`),
   щоб відновити до-#833-тональний контраст у модулях, де Finyk + accent
   зустрічаються разом? Поза WCAG-скоупом — окремо на design-ревью.
3. **Mobile-parity-таймлайн.** Mobile зараз у beta; чи може крок 4 сліпнути
   на наступне mobile-release-вікно без порушення жодного
   in-flight-a11y-коммітменту? Рекомендація: так; web — AA-гейт, що відвантажується першим.

---

## 5. Посилання

- [`packages/design-tokens/tokens.js`](../../packages/design-tokens/tokens.js)
  — сире джерело палітри.
- [`packages/design-tokens/tailwind-preset.js`](../../packages/design-tokens/tailwind-preset.js)
  — `*-strong`-прецедент у `finyk` / `fizruk` / `routine` / `nutrition`.
- [`docs/design/BRANDBOOK.md` § Color Contrast](./BRANDBOOK.md#color-contrast).
- [`apps/web/tests/a11y/axe.spec.ts`](../../apps/web/tests/a11y/axe.spec.ts)
  — гейт, який ця пропозиція дозволяє ре-ввімкнути.
- WCAG 2.1 § 1.4.3 Contrast (Minimum) — AA: 4.5 : 1 body / 3 : 1 large.
- PR [#851](https://github.com/Skords-01/Sergeant/pull/851) — викидання
  `/design` зі SURFACES.
- PR [#852](https://github.com/Skords-01/Sergeant/pull/852) — a11y-поліровка
  примітивів Tabs / Banner / Select.
