# Design System — Spacing, Elevation та Theming

> **Last touched:** 2026-10-01 by @claude. **Next review:** 2027-04-06.
> **Status:** Active (v2 redesign foundation merged 2026-05)

Цей документ охоплює spacing scale, радіуси, тіні, мобільні брейкпоінти та темну тему / High Contrast.

Повний index → [`../design-system.md`](../design-system.md).

---

## 4. Spacing, радіуси, тіні

### Spacing scale

Tailwind `spacing` (базова шкала 4px) + кастомні:
`p-4.5` (18px), `h-13` (52px), `h-15` (60px), `h-18` (72px), `h-22` (88px).
Гайдлайн: padding карток ≥16px (`p-4`), гутер між картками ≥12px
(`gap-3`), в hero — `p-6`.

### Радіуси

Три семантичні тири (`borderRadius` у
[`tailwind-preset.js`](../../../../packages/design-tokens/tailwind-preset.js),
розбір — [`radius-rhythm.md`](../radius-rhythm.md)):

| Тир     | Клас           | Значення | Використання                                                     |
| ------- | -------------- | -------- | ---------------------------------------------------------------- |
| CONTROL | `rounded-xl`   | 12 px    | Кнопки, інпути, бейджі, чипи, icon-buttons, segmented            |
| CARD    | `rounded-2xl`  | 16 px    | Картки, панелі, рядки списку, dropdown-и, sticky-банери          |
| HERO    | `rounded-3xl`  | 24 px    | `Modal`, `Sheet`, hero-картки, bento-плитки модулів              |
| PILL    | `rounded-full` | 9999 px  | FAB, аватари, статус-точки, теги                                 |
| SWATCH  | `rounded-sm`   | 2 px     | Комірки heatmap, точки легенди чарта                             |
| —       | `rounded-4xl`  | 32 px    | **Не частина ритму** — one-off ілюстративні поверхні (5xl 40 px) |

**Заборонено в новому коді:** `rounded-lg` (8 px — між CONTROL і CARD
без ролі), `rounded-md` (6 px — злито в CONTROL, бери `rounded-xl`),
`rounded` / `rounded-DEFAULT` (4 px — без семантичного слота). Колишнє
ESLint-правило `no-rounded-lg` retired
[ADR-0081](../../../governance/adr/0081-repository-simplification.md) —
конвенцію тримають tokens + review. Паралельний v2-namespace
(`r-md`/`r-lg`/`r-xl`/`r-2xl`, 12/14/18/24 px) прибрано в design-audit
2026-07.

Правило: **одна картка — один радіус**. Не змішуй `rounded-xl`
header + `rounded-2xl` body.

### Тіні (елеваційна шкала e0..e5)

Семантична шкала єдине джерело правди для глибини. Розподіл рівнів —
в [`packages/design-tokens/tokens.js`](../../../../packages/design-tokens/tokens.js) →
`elevation`; CSS-змінні лежать в
[`apps/web/src/styles/theme.css`](../../../../apps/web/src/styles/theme.css)
і автоматично перемикаються в `.dark` — ніяких `dark:shadow-*`
(дизайн-конвенція).

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
  <Stat label="Баланс" value="₴12 345" />
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
<div className="shadow-card dark:shadow-2xl" />         /* парні dark: — дизайн-конвенція */
<div className="shadow-e3 z-toast" />                   /* попап на toast тірі — розсинхрон з e3 */
```

#### Legacy aliases

Наявні класи `shadow-soft / shadow-card / shadow-float / shadow-glow` продовжують
працювати — вони внутрішньо мапляться на нову шкалу (`card → e1`,
`float → e3`, `soft → e4`). Новий код має вживати явний `shadow-eN`.

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
4. Safe-area insets (notch / home indicator) — через `page-tabbar-pad`
   (88px + inset-bottom), `routine-main-pad`, `routine-sheet-pad`,
   `fizruk-sheet-pad`, `fizruk-above-tabbar` — це `@utility`-правила в
   [`apps/web/src/styles/utilities.css`](../../../../apps/web/src/styles/utilities.css).

---

## 8. Темна тема + High Contrast

### 8.1 3-режимний state-machine (`useTheme`)

З Track 9 (Design-System polish, PR-#057) у нас один уніфікований
контролер теми — `apps/web/src/shared/hooks/useTheme.ts`. Стан:

| Choice  | Що робить                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `light` | Жодного theme-класу на `<html>`.                                                                                         |
| `dark`  | `<html class="dark">` — повна dark-палітра.                                                                              |
| `hc`    | `<html class="hc">` (+ `dark` якщо OS — dark). HC-режим залишається світлим/темним за системою, але токени бампають AAA. |

Авто-режим (`system`), що live-слідував за `prefers-color-scheme`, прибрано
на прохання власника (2026-08-18): три явні теми замість чотирьох.

Контракт-точки:

- **Bootstrap** — `useTheme()` викликається один раз у `core/app/RootLayout.tsx` і
  володіє класами на `<html>`. Не клич `useTheme` повторно у дочірніх
  компонентах для side-effect-ів — використовуй `<ThemeSwitcher />` (він
  читає тих самий hook).
- **Persistence** — вибір зберігається в `hub_theme_v2` (`localStorage`,
  через `@shared/storage`). Старі ключі (`hub_dark_mode_v1`,
  `hub_dark_mode_schedule_v1`) і ретайрнутий `system` мігруються
  автоматично.
- **Cross-tab sync** — `webKVStore.onChange(hub_theme_v2)` ловить DOM
  `storage`-event (LS-fallback) АБО `BroadcastChannel("kv-store")`
  (SQLite-warm-cache). Зміна теми в одній вкладці прокидається в інші
  у живому часі.
- **Системні преференції — рівно один раз.** Коли валідного запису нема,
  `readInitialChoice()` бере старт із OS: `prefers-contrast: more` /
  `forced-colors: active` → `hc`, інакше `prefers-color-scheme: dark` →
  `dark`. Так слабкозорий користувач приходить у AAA-набір, не шукаючи
  перемикач. Після першого ж явного вибору OS уже нічого не перевизначає.
- **`prefers-color-scheme` у рантаймі** — підписка на media-query лишається,
  але її споживає ЛИШЕ `hc`: він обирає світлу/темну основу, поверх якої
  лягають AAA-токени.

### 8.2 High-Contrast контракт

`html.hc { ... }` у `apps/web/src/styles/theme.css` — це AAA-leaning
оверлей семантичних токенів поверх resolved-light/dark base-у. Контракт:

1. **Text vs. bg ≥ 7:1** — WCAG AAA «Contrast (Enhanced)». `--c-text`
   йде в pure `#000000` (HC-світла) і `#ffffff` (HC-темна).
2. **Дільники ≥ 4.5:1** — `--c-line` бампається на near-black/near-white.
   Карти, інпути, таблиці отримують видимий edge без shadow-залежності.
3. **Focus-ring 5px проти базових 3px** — `--ring-width-hc: 5px;` і
   `--focus-ring-width: var(--ring-width-hc);` Усі примітиви, які
   читають `--focus-ring-width`, автоматично отримують ширший фокус-
   індикатор.

   > **Виправлення 2026-09-13.** Тут стояло `3px` — рівно стільки ж, скільки
   > в `:root`. Тобто swap підставляв ідентичне значення, жоден примітив
   > нічого не отримував, і твердження «автоматично отримують ширший»
   > було неправдою від моменту написання. Помітити на око неможливо:
   > токен є, оверайд є, індирекція є — рівні лише самі числа. Розбіжність
   > тепер тримає `apps/web/src/styles/theme.focusRingHc.test.ts`
   > (HC строго більший за базу і щонайменше в півтора раза). Колір — `brand-strong` на світлій, `amber-300` на темній
   > (≥ 3:1 проти власного bg).

   > **Друге виправлення, того ж дня.** Полагодивши число, ми виявили, що
   > «усі примітиви» — теж неправда, тільки з іншого боку. Токен доходив до
   > **60 місць із 302**: тих, що беруть утиліту `focus-ring`. Решта 242
   > пишуть ширину руками (`focus-visible:ring-2` — рецепт, який цей же
   > канон рекомендує нижче і в [`01-tokens-colors.md`](./01-tokens-colors.md)),
   > а Tailwind 4 запікає в `.ring-2` **літерал** `calc(2px + …)`, до якого
   > `--focus-ring-width` не дотягується взагалі.
   >
   > Тобто канон описував два взаємовиключні механізми в різних файлах, і
   > ширший HC-індикатор отримував той, яким користувалась меншість. Лікує
   > одне правило в кінці `theme.css` (поза `@layer` — усередині шару воно
   > програє `.ring-2` з `utilities` і мовчки не діє), яке переоголошує лише
   > ширину, лишаючи call-site-у його колір, відступ та `inset`. Заміряно в
   > Chromium: рукописне кільце 4px → **7px**, `focus-ring` 5px → 7px,
   > `ring-inset` 2px → 5px inset, навмисне `focus-visible:ring-0` лишається
   > 0px. Форму й локацію пінить той самий `theme.focusRingHc.test.ts`.
   >
   > **Що лишилось свідомо не вирівняним:** у БАЗОВІЙ темі рукописне кільце
   > дає 2px, а `focus-ring` — 3px. Вирівнювання змінило б вигляд 242 місць
   > усім користувачам, а не лише тим, хто вмикає HC, тож це продуктове
   > рішення, а не правка a11y-дефекту.

4. **Жодних low-opacity surfaces** — soft-варіанти
   (`success-soft`, `brand-soft`, `finyk-soft`, …) фліпаються на
   full-strength fill, щоб banner / badge / pill читалися на 7:1.

#### Аудит токенів у HC

| Token              | Light → HC-light                  | Dark → HC-dark                    | Контраст vs `--c-bg` |
| ------------------ | --------------------------------- | --------------------------------- | -------------------- |
| `--c-text`         | `#0f1713` → `#000000`             | `#f2f6f2` → `#ffffff`             | ≥ 18 : 1             |
| `--c-muted`        | `#535c56` → `#1f1c19`             | `#a3aea6` → `#e6e0da`             | ≥ 14 : 1             |
| `--c-subtle`       | `#605a54` → `#332e29`             | `#98a49c` → `#cfc7bf`             | ≥ 9 : 1              |
| `--c-line`         | `#d2cec5` → `#574b3c`             | `#48423e` → `#a89c8e`             | ≥ 4.7 : 1            |
| `--c-border`       | = `--c-line`                      | = `--c-line`                      | ≥ 4.7 : 1            |
| `--c-success-soft` | `emerald-100` → `emerald-200`     | `#065f46` → `emerald-700`         | ≥ 4.6 : 1            |
| `--c-danger-soft`  | `red-100` → `red-200`             | `red-800` → `red-700`             | ≥ 4.6 : 1            |
| `--c-brand-soft`   | `stone-100 #f5f5f4` → `stone-200` | `stone-800 #292524` → `stone-700` | ≥ 4.6 : 1            |

> Базові колонки оновлено 2026-09-16 за `:root` / `.dark` у `theme.css`
> (світла база Б1 2026-08-07, темна — «Чорнило» з `inkTheme` у `tokens.js`);
> HC-колонки — `html.hc` / `html.hc.dark` там само. `brand-soft` — stone,
> не emerald, з M1 (хаб нейтральний).

> ⚠ Додаючи новий semantic-token, дзеркаль override у `html.hc { ... }`
> _і_ `html.hc.dark { ... }`. Скоупні preview-блоки
> (`[data-theme-preview="…"]` в тому ж файлі) — copy/paste тих самих
> values для side-by-side у `DesignShowcase`.

### 8.3 UX-контракт `<ThemeSwitcher />`

```tsx
import { ThemeSwitcher } from "@shared/components/ui";

// Єдина поверхня — компактний segmented control у header-меню «⋯».
// 3 кнопки (sun/moon/contrast) з підписами, згруповані як radiogroup.
<ThemeSwitcher />;
```

Варіанта `variant="dropdown"` більше немає: він мав нуль продакшн-викликів
(рендерився лише власними тестами та стóрі) і був видалений у round-2 UI
audit X4 — деталі в докстрингу `ThemeSwitcher.tsx`.

- Token-only стилізація (дизайн-конвенція — tokens + review, ex-Hard
  Rules #11/#13, retired ADR-0081). Жодного `bg-[#...]` —
  все через `bg-panel`, `bg-brand-soft`, `border-line`.
- `focus-visible:ring-2 ring-focus/45` (`--c-ring`, teal; дизайн-конвенція —
  `brand` з M1 нейтральний і кільця не фарбує).
- Кожен radio-item має `aria-label` (Ukrainian) + `aria-checked`.

### 8.4 Не пиши `dark:` пар

Усі кольори резолвяться через CSS-змінні `--c-*`, тож додавати
`dark:bg-...` більшості разів **НЕ треба**:

```tsx
// ❌ НЕ пиши
<div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700">

// ✅ Пиши
<div className="bg-surface border border-border">
```

Dark-override потрібен тільки коли ефект несиметричний між темами
(напр. градієнти hero-картки). У таких випадках документуй у комменті.

### 8.5 Стіл і зона (фон у hue модуля)

Фонова система web з 2026-09-03 (рішення власника; замінила mesh —
радіальних свічень більше немає в жодній темі). **Стіл** — фон сторінки,
зсунутий у hue модуля (хрома ≤5%, світлота майже як `--c-bg`, бо
`--c-subtle` має тримати ≥4.5:1 на кожному столі — гейт
`contrast.test.js`); **зона** — той самий hue на крок глибше, лише під
шапкою й табами модуля. Хаб нейтральний, без hue, щоб не читатись як
п'ятий модуль. Темна тема: стіл один для всіх (ink base `#14100e`), зона —
7% tier-400 акценту на ньому. HC зводить обидва до `--c-bg-base`.

Джерело hex — `moduleSurfaces` у
[`tokens.js`](../../../../packages/design-tokens/tokens.js); дзеркало —
`--module-desk-rgb` / `--module-zone-rgb` у `theme.css` (модульні значення
через `[data-module-accent=…]`, який ставить `ModuleAccentProvider`).
Класи: `.bg-mesh` (лишив назву заради `MeshBackground.tsx`) малює стіл,
`.bg-zone` — зону (її рендерить `ModuleHeader`), `.zone-chip` — прозорі
контроли в зоні з контуром 30% сильного акценту модуля. Міняй пару
tokens.js ↔ theme.css разом; поглиблюючи стіл чи зону, спершу дивись у
`contrast.test.js`, чи тримає драбина третинних тонів.
