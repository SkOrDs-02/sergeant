# Design System — Spacing, Elevation та Theming

> **Last validated:** 2026-06-12 by @claude. **Next review:** 2026-09-10.
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
в [`packages/design-tokens/tokens.js`](../../../../packages/design-tokens/tokens.js) →
`elevation`; CSS-змінні лежать в
[`apps/web/src/styles/theme.css`](../../../../apps/web/src/styles/theme.css)
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
<div className="shadow-card dark:shadow-2xl" />         /* парні dark: — Hard Rule #13 */
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
4. Safe-area insets (notch / home indicator) — через `page-tabbar-pad`,
   `routine-main-pad`, `fizruk-above-tabbar` (див. `src/index.css`).

---

## 8. Темна тема + High Contrast

### 8.1 4-режимний state-machine (`useTheme`)

З Track 9 (Design-System polish, PR-#057) у нас один уніфікований
контролер теми — `apps/web/src/shared/hooks/useTheme.ts`. Стан:

| Choice   | Що робить                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `light`  | Жодного theme-класу на `<html>` (дефолт).                                                                                 |
| `dark`   | `<html class="dark">` — повна dark-палітра.                                                                               |
| `system` | Клас `dark` реактивно слідує за `window.matchMedia('(prefers-color-scheme: dark)')`. OS-level зміна підхоплюється в live. |
| `hc`     | `<html class="hc">` (+ `dark` якщо OS — dark). HC-режим залишається світлим/темним за системою, але токени бампають AAA.  |

Контракт-точки:

- **Bootstrap** — `useTheme()` викликається один раз у `core/app/RootLayout.tsx` і
  володіє класами на `<html>`. Не клич `useTheme` повторно у дочірніх
  компонентах для side-effect-ів — використовуй `<ThemeSwitcher />` (він
  читає тих самий hook).
- **Persistence** — вибір зберігається в `hub_theme_v2` (`localStorage`,
  через `@shared/storage`). Старі ключі (`hub_dark_mode_v1`,
  `hub_dark_mode_schedule_v1`) мігруються автоматично — fall-back на
  `system` коли запис відсутній.
- **Cross-tab sync** — `webKVStore.onChange(hub_theme_v2)` ловить DOM
  `storage`-event (LS-fallback) АБО `BroadcastChannel("kv-store")`
  (SQLite-warm-cache). Зміна теми в одній вкладці прокидається в інші
  у живому часі.
- **`prefers-color-scheme`** — підписка на media-query робить `system` і
  `hc` справді живими. OS-level toggle відбивається без перезавантаження.

### 8.2 High-Contrast контракт

`html.hc { ... }` у `apps/web/src/styles/theme.css` — це AAA-leaning
оверлей семантичних токенів поверх resolved-light/dark base-у. Контракт:

1. **Text vs. bg ≥ 7:1** — WCAG AAA «Contrast (Enhanced)». `--c-text`
   йде в pure `#000000` (HC-світла) і `#ffffff` (HC-темна).
2. **Дільники ≥ 4.5:1** — `--c-line` бампається на near-black/near-white.
   Карти, інпути, таблиці отримують видимий edge без shadow-залежності.
3. **Focus-ring 3px** — `--ring-width-hc: 3px;` і
   `--focus-ring-width: var(--ring-width-hc);` Усі примітиви, які
   читають `--focus-ring-width`, автоматично отримують ширший фокус-
   індикатор. Колір — `brand-strong` на світлій, `amber-300` на темній
   (≥ 3:1 проти власного bg).
4. **Жодних low-opacity surfaces** — soft-варіанти
   (`success-soft`, `brand-soft`, `finyk-soft`, …) фліпаються на
   full-strength fill, щоб banner / badge / pill читалися на 7:1.

#### Аудит токенів у HC

| Token              | Light → HC-light              | Dark → HC-dark                | Контраст vs `--c-bg` |
| ------------------ | ----------------------------- | ----------------------------- | -------------------- |
| `--c-text`         | `#1c1917` → `#000000`         | `#faf7f1` → `#ffffff`         | ≥ 18 : 1             |
| `--c-muted`        | `#57534e` → `#1f1c19`         | `#b4aea9` → `#e6e0da`         | ≥ 14 : 1             |
| `--c-subtle`       | `#6b645d` → `#332e29`         | `#878079` → `#cfc7bf`         | ≥ 9 : 1              |
| `--c-line`         | `#ebe4da` → `#574b3c`         | `#524a41` → `#a89c8e`         | ≥ 4.7 : 1            |
| `--c-border`       | = `--c-line`                  | = `--c-line`                  | ≥ 4.7 : 1            |
| `--c-success-soft` | `emerald-100` → `emerald-200` | `emerald-900` → `emerald-700` | ≥ 4.6 : 1            |
| `--c-danger-soft`  | `red-100` → `red-200`         | `red-900` → `red-700`         | ≥ 4.6 : 1            |
| `--c-brand-soft`   | `emerald-100` → `emerald-200` | `emerald-900` → `emerald-700` | ≥ 4.6 : 1            |

> ⚠ Додаючи новий semantic-token, дзеркаль override у `html.hc { ... }`
> _і_ `html.hc.dark { ... }`. Скоупні preview-блоки
> (`[data-theme-preview="…"]` в тому ж файлі) — copy/paste тих самих
> values для side-by-side у `DesignShowcase`.

### 8.3 UX-контракт `<ThemeSwitcher />`

```tsx
import { ThemeSwitcher } from "@shared/components/ui";

// Compact — header chrome, dense rows. 4 IconButton-и (sun/moon/monitor/contrast)
// згруповані як radiogroup.
<ThemeSwitcher />;

// Dropdown — Settings, DesignShowcase, verbose surfaces. Триггер-кнопка
// + меню з лейблами та описом кожного режиму.
<ThemeSwitcher variant="dropdown" />;
```

- Token-only стилізація (Hard Rules #11, #13). Жодного `bg-[#...]` —
  все через `bg-panel`, `bg-brand-soft`, `border-line`.
- `focus-visible:ring-2 ring-brand-500/45` (Hard Rule #14).
- Кожен radio-item має `aria-label` (Ukrainian) + `aria-checked`.
- Dropdown — `role="menu"` + `aria-haspopup="menu"`, ESC закриває,
  фокус повертається на тригер.

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
