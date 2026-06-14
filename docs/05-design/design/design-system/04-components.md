# Design System — Примітиви UI, Focus, A11y та Gestures

> **Last touched:** 2026-06-14 by @claude. **Next review:** 2026-09-12.
> **Status:** Active (v2 redesign foundation merged 2026-05)

Цей документ охоплює UI-примітиви, focus/disabled/loading контракт, правила кодування, міграційні патерни, нові компоненти та хуки, gestures/a11y, та keyboard-first overlays (DropdownMenu, CommandPalette).

Повний index → [`../design-system.md`](../design-system.md).

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
| `finyk`     | `text-finyk-strong dark:text-finyk-300/70`     | brand-tint у модулі ФІНІК             |
| `fizruk`    | `text-fizruk-strong dark:text-fizruk-300/70`   | brand-tint у модулі ФІЗРУК            |
| `routine`   | `text-routine-strong dark:text-routine-300/70` | brand-tint у модулі Рутина            |
| `nutrition` | `text-nutrition-strong dark:text-nutrition/70` | brand-tint у модулі Харчування        |

> **Dark-mode AA (Hard Rule a11y):** де-емфазований `/70` підпис має тримати ≥4.5:1 на `--c-panel` (#201c19). `finyk`/`routine`/`fizruk` беруть світліший `-300`-тир (emerald/coral/cyan-300 @ /70 ≈ 5.5–6.3:1); `nutrition` лишається на lime-500 (/70 ≈ 4.9:1, вже AA). DEFAULT-500 у finyk/routine чистий AA лише на повній непрозорості — `-300` застосовуємо **тільки** в `dark:` `/70`-слоті підпису.

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

Канонічний примітив для **порожніх станів і дрібних error/empty карток**

- повноекранних error-сторінок (`/404`, `/500`, `/offline`). Один
  компонент тримає три розміри (`sm` / `md` / `lg`), п'ять варіантів
  (`neutral` / `info` / `success` / `warning` / `danger`) і чотири
  module-accent override-и (`finyk` / `fizruk` / `routine` / `nutrition`)
  — тож кожна порожня панель в апці пропускається через ту саму tone-
  палітру, той самий focus-контракт і той самий SR-announce
  (`role="status"`, `aria-live="polite"`).

**Слоти** (всі необов'язкові, окрім `title`):

- `illustration` — куратований SVG із `apps/web/src/assets/illustrations/`
  (всі використовують `currentColor` + design-token utilities; жодного
  inline hex — Hard Rule #11). Якщо `illustration` не задано — fallback
  на `icon` у бордерованому box-і з tone-фоном.
- `eyebrow` — короткий caps-чип над title-ом ("404", "OFFLINE", "ERROR").
- `title` — короткий заголовок (масштабується розміром).
- `description` — повний абзац підтримки.
- `primaryAction` / `secondaryAction` — два слоти для CTA-кнопок
  (зазвичай `<Button variant="primary">` + `<Button variant="secondary">`).
- `tertiaryLink` — текстовий link під CTA (наприклад, "докладніше у
  довідці").
- `hint` — підказка-tip із lightbulb-іконкою (тон `text-subtle`).
- `examplePreview` — слот для inline-моку реальних даних (показуємо
  "як це виглядатиме, коли заповниш модуль").
- `action` (backward-compat alias до `primaryAction`).

**Розміри**:

| size | Коли                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------ |
| `sm` | In-card / in-list плейсхолдери (порожній transactions list, no-results filter). Padding ≈ 16 px, без illustration. |
| `md` | Sub-page рівень (порожня вкладка, dialog body). Дефолт.                                                            |
| `lg` | Повноекранні error-сторінки (404 / 500 / offline), top-level empty states.                                         |

**Варіанти** використовують tone-палітру з §3 — `-soft` фон + `-strong`
текст (Hard Rule #9 для контрасту ≥ 4.5 : 1). Module-accent (якщо
заданий) **перекриває** variant — модульна семантика сильніша за
загальну (порожній стан у `/finyk` завжди має finyk-tint, навіть якщо
лежить у error-state).

**Tone of voice** (з [`docs/05-design/design/brandbook.md`](../brandbook.md)):

| Контекст              | Що писати                                                                          | Чого уникати                        |
| --------------------- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| Empty list            | "Тут поки нічого немає. Додай першу транзакцію — і Фінік усе порахує."             | "No data."                          |
| No search results     | "Нічого не знайшли за «{query}». Спробуй інший фільтр."                            | "Empty result set."                 |
| Offline               | "Немає зʼєднання, але дані не загубляться — синхронізуємо, коли воно повернеться." | "Network error: ENOTCONN."          |
| 500 / server          | "Щось пішло не так. Спробуй оновити сторінку — зазвичай це допомагає."             | "Internal Server Error (HTTP 500)." |
| 404 / not found       | "Сторінку не знайдено. Перевір посилання або повернись на головну."                | "Page does not exist."              |
| Success / celebration | "Готово! +5 KM до тижневого балансу" (емодзі дозволені тут на знак)                | "Operation completed successfully." |

Дві правила-черевики:

1. **Завжди давай шлях назад.** Кожен EmptyState (окрім `sm`-in-card
   плейсхолдерів) має мати **primaryAction** — кнопку, що повертає
   користувача в робочий потік. "На головну", "Спробувати ще",
   "Додати першу транзакцію" — три найчастіші формулювання.
2. **Уникай blamefulness.** "Ти ввів неправильне посилання" — погано;
   "Здається, ця адреса вже не існує" — добре. Помилка — це факт
   стану системи, а не звинувачення користувача.

**Приклади**:

```tsx
// In-card порожній стан (sm)
<EmptyState
  size="sm"
  icon={<Icon name="receipt" size={20} />}
  title="Транзакцій немає"
  description="Підключи картку або додай вручну."
  primaryAction={<Button size="sm">Додати</Button>}
/>

// Full-page error (lg + danger variant)
<EmptyState
  size="lg"
  variant="danger"
  eyebrow="500"
  illustration={<ServerErrorIllustration size={200} />}
  title="Щось пішло не так"
  description="Сервер тимчасово не зміг обробити запит."
  primaryAction={
    <Button variant="primary" size="lg" onClick={reload}>
      <Icon name="refresh-cw" size={16} />
      Оновити сторінку
    </Button>
  }
/>

// Module-accent (override variant)
<ModuleEmptyState
  module="finyk"
  variant="default"
  onAction={openCreate}
/>
```

**Three canonical error pages** (`apps/web/src/core/errors/`):

| Сторінка              | Variant   | Illustration              | CTA                    |
| --------------------- | --------- | ------------------------- | ---------------------- |
| `NotFoundPage` 404    | `info`    | `NotFoundIllustration`    | "На головну" + "Назад" |
| `ServerErrorPage` 500 | `danger`  | `ServerErrorIllustration` | "Оновити сторінку"     |
| `OfflinePage`         | `warning` | `OfflineIllustration`     | "Спробувати ще"        |

Всі три — composition над `<EmptyState size="lg">`, тож focus-контракт,
motion-budget і SR-announce ідентичні. Жодного inline-стилю,
жодного hex — все через tokens.

**Ілюстрації** (`apps/web/src/assets/illustrations/`):
`EmptyListIllustration`, `NoResultsIllustration`, `OfflineIllustration`,
`ServerErrorIllustration`, `NotFoundIllustration`,
`SuccessCelebrationIllustration` — кожна побудована тільки на
`currentColor` + token-utility класах (`fill-panelHi`, `stroke-line`,
`fill-danger-soft`, …), тож автоматично перефарбовується для світлої/
темної теми та інтегрується в module-accent overrides без додаткового
коду.

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
| `:focus-visible` | `ring-2 ring-focus/45 ring-offset-2 ring-offset-bg` на кнопках, `ring-focus/30` на інпутах (без offset)         |
| `:disabled`      | `opacity-50`, `cursor-not-allowed`, `pointer-events-none`                                                       |
| `loading`        | Показує `Spinner`, встановлює `aria-busy="true"`, disables pointer events                                       |
| `:active`        | `active:scale-[0.98]` для прес-feedback                                                                         |
| `:hover`         | Тільки там, де `hover:` реально працює (не-touch); на `interactive` картках — `translate-y-[-2px] shadow-float` |

### 6.1 Semantic A11y / states tokens (Wave 2, 2026-05-13)

Migrated all primitives (`Button`, `Input`, `Select`, `Tabs`, `Switch`,
`Sheet`, `EmptyState`, `ModuleBottomNav`, `SkipLink`, `InputDialog`) +
high-traffic shell (Hub headers, search, onboarding, auth) від raw
`brand-500` / `primary` на семантичні a11y-токени. Це розв'язує бренд-палітру
від ролі (focus / selection / caret / scrollbar / divider) — оновлення
бренду не ламає a11y-контракт.

| Token (CSS-var)             | Tailwind utility(s)                      | Роль                                                   |
| --------------------------- | ---------------------------------------- | ------------------------------------------------------ |
| `--c-ring`                  | `ring-focus`, `bg-focus`, `text-focus`   | Канонічний клавіатурний focus ring (45% альфа default) |
| `--c-ring-strong`           | `ring-focus-strong`, `bg-focus-strong`   | Солід focus для busy surfaces / hero карток            |
| `--c-ring-offset`           | `ring-offset-focus-offset`               | Background-offset для ring-пари (рідко явно)           |
| `--c-selection-bg` / `-fg`  | `bg-selection`, `text-selection-fg`      | `::selection` / `::-moz-selection` wash                |
| `--c-caret`                 | `caret-brand` (спеціальний utility)      | Текстовий курсор в input/textarea                      |
| `--c-scrollbar-thumb`       | `bg-scrollbar-thumb`                     | Default thumb (global scrollbar)                       |
| `--c-scrollbar-thumb-hover` | `bg-scrollbar-thumb-hover`               | Hover-стейт thumb                                      |
| `--c-scrollbar-track`       | `bg-scrollbar-track`                     | Опційно видимий track — default трансперентний         |
| `--c-divider-weak`          | `border-divider-weak`, `bg-divider-weak` | Hairline між рядками у списку                          |
| `--c-divider`               | `border-divider`, `bg-divider`           | Стандартний дільник усередині картки                   |
| `--c-divider-strong`        | `border-divider-strong`                  | Дільник між великими секціями (header → content)       |

#### Canonical focus pattern

```tsx
// Стандартна кнопка / link / iconbutton (Hard Rule #14)
className =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

// Інпут (без offset — краще всередині заповнення)
className = "focus-visible:ring-2 focus-visible:ring-focus/30 caret-brand";

// Hero / busy surface — solid ring для extra-punch
className =
  "focus-visible:ring-2 focus-visible:ring-focus-strong focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
```

#### Module-accent focus exceptions (Hard Rule #12)

Tabs/SubTabs з module variant (`finyk`, `fizruk`, `routine`, `nutrition`)
зберігають модульний ring (`ring-finyk/45` і т.д.), щоб focus
підсилював module identity. Це єдиний виявлений виняток; brand variant
вже на `ring-focus`.

#### Do / Don't

```tsx
// ❌ Раніше (raw палітра, ламається при ребренді)
<button className="focus-visible:ring-2 focus-visible:ring-brand-500/45">

// ✅ Тепер (семантичний a11y-токен)
<button className="focus-visible:ring-2 focus-visible:ring-focus/45">

// ❌ Чистий `focus:` кольоровий (ловиться sergeant-design/prefer-focus-visible)
<button className="focus:ring-2 focus:ring-emerald-500">

// ❌ Кольоровий ринг на своєму colour-family без module-context
<button className="focus-visible:ring-violet-500">

// ❌ Hex в className (Hard Rule #11)
<hr className="border-[#ebe4da]" />

// ✅ Семантичний divider
<hr className="border-divider" />
```

#### Contrast / WCAG notes

- `--c-ring` (#10b981 light / #34d399 dark) на `--c-panel` (#ffffff /
  #201c19) резольвиться ≥ 3:1 в обох темах — WCAG 1.4.11
  «non-text contrast» для focus-indicator passed.
- `--c-ring-strong` (#047857 light / #6ee7b7 dark) для кольорових hero
  surfaces де базовий ring втрачає видимість (градієнтні
  картки) — ratio ≥ 4.5:1.
- `--c-selection-bg` / `--c-selection-fg` (#a7f3d0 / #064e3b light;
  #047857 / #d1fae5 dark) — ratio 7.8:1 light, 6.4:1 dark; selected
  text завжди читається (WCAG 1.4.3 AA для text).
- `--c-divider-weak` — явно нижче 3:1 проти panel; використовувати
  тільки як hairline (не єдиний індикатор розмежування).

#### Showcase

[`DesignShowcase`](../../../../apps/web/src/core/DesignShowcase/index.tsx) — розділ
«A11y / States» (link `#a11y`): focus rings в 4 variants, selection wash
на боді і в код-блоці, caret demo, global scrollbar + `custom-scrollbar`
варіант, divider trio, token cheat-sheet.

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

### useFocusTrap

Accessibility focus trap для модалів.

```tsx
const modalRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);
<div ref={modalRef}>...</div>;
```

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
- Додати більше haptic feedback у key interactions.
- Profile page з avatar upload.
