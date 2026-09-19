# Sergeant Design System

> **Last validated:** 2026-09-16 by @claude (індекс і п'ять частин звірено з `packages/design-tokens` і `apps/web/src/styles`; v2-блок переведено в історію, showcase — `/design`). **Next review:** 2027-01-25.
> **Status:** Active (brand → stone via 2026-07 M1; канон кнопки `(variant, tone)` з 2026-09-16; редизайн v2 закрито 2026-05-21)

Єдина візуальна мова для хаба з 4 модулями: **ФІНІК**, **ФІЗРУК**, **Рутина**,
**Харчування**. Документ — контракт між дизайном і кодом; будь-який новий
екран має користуватися цим набором токенів і примітивів. При розбіжності
з [`packages/design-tokens`](../../../packages/design-tokens/README.md)
перемагають токени; портативне дзеркало для агентів — [`DESIGN.md`](../../../DESIGN.md).

> **Про v2 (травень 2026) — історія, не інструкція.** Редизайн v2 додав
> паралельний namespace (glass surfaces, mesh background, ink-strong, `rounded-r-*`)
> поверх `--c-*` токенів. Станом на 2026-09-16 з нього чинні Manrope,
> ink-типографіка і три теми; glass-токени — back-compat-аліаси з непрозорою
> заливкою, mesh-свічення зняті 2026-09-03 (фон — «стіл» у hue модуля, див.
> [`03 § 8`](./design-system/03-spacing-elevation-theming.md)), `rounded-r-*`
> видалено в аудиті 2026-07. **Не бери BEFORE/AFTER з
> [`redesign-v2/migration.md`](./redesign-v2/migration.md) як канон** — кластер
> `Reference`; канон — цей документ і його частини.

> **Brand palette — stone, не emerald (2026-07 M1).** `brand` — нейтральний
> warm-stone (hub — тихий батько); `finyk` — teal, `fizruk` — cyan, focus ring —
> teal через окремий `--c-ring`. Emerald **retired** як brand/CTA-колір. Якщо
> бачиш emerald у новому коді або старій доці — це застаріле; канонічна таблиця
>
> - повна історія палітри у [`design-system/01-tokens-colors.md` §2.3/§2.6](./design-system/01-tokens-colors.md).

> **TL;DR для контриб'ютора.** Якщо ти пишеш новий екран — імпорти все з
> `@shared/components/ui` і використовуй семантичні класи Tailwind
> (`bg-surface`, `text-fg`, `border-border`). Ніколи не додавай hex-коди в
> `className`, не створюй «ще одну кастомну картку», і не пиши
> `text-gray-500` / `bg-white`.

---

## Зміст — тематичні частини

Монолітний документ розбито на 5 тематичних файлів у [`design-system/`](./design-system/):

| Файл                                                                                 | Розділи                                   | Зміст                                                                          |
| ------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------ |
| [`01-tokens-colors.md`](./design-system/01-tokens-colors.md)                         | §1, §2, §9                                | Принципи, кольорові токени, WCAG AA контраст                                   |
| [`02-typography.md`](./design-system/02-typography.md)                               | §3                                        | Типографічна шкала (`text-style-*`, tier-2, Prose)                             |
| [`03-spacing-elevation-theming.md`](./design-system/03-spacing-elevation-theming.md) | §4, §7, §8                                | Spacing, радіуси, тіні, мобільні брейкпоінти, темна тема / HC                  |
| [`04-components.md`](./design-system/04-components.md)                               | §5, §6, §10, §11, §12, §13, §16, §18, §19 | Примітиви UI, Focus/a11y, Coding rules, Gestures, DropdownMenu, CommandPalette |
| [`05-motion-offline-error.md`](./design-system/05-motion-offline-error.md)           | §14, §15                                  | Motion tokens, Animation choreography, Offline/Empty/Error патерни             |

---

## Живий styleguide

Дзеркало цього контракту — навігабельний styleguide
[`apps/web/src/core/DesignShowcase`](../../../apps/web/src/core/DesignShowcase).
Сторінка **`/design`** (`DESIGN_PATH`; dev / preview-only, поза `DEV` — 404)
має sticky-сайдбар на 18 розділів (`_shared/nav.ts`), тогли theme /
density / direction / reduced-motion, у кожному розділі: live demo,
copy-paste snippet, do/don't пари.

Якорі та maturity на 2026-09-16 (джерело — `NAV_SECTIONS` у `nav.ts`; повна
таблиця з гейтами — [`README.md § Maturity matrix`](./README.md#maturity-matrix-primitives)):

| Розділ            | Якір            | Maturity         | Що демонструє                                                              |
| ----------------- | --------------- | ---------------- | -------------------------------------------------------------------------- |
| Кольори           | `#colors`       | **stable**       | semantic surfaces, brand, statuses, data-viz, alpha                        |
| Типографіка       | `#typography`   | **stable**       | 8 ролей `text-style-*`, ellipsis                                           |
| Spacing           | `#spacing`      | **stable**       | spacing scale + canonical radii                                            |
| Elevation         | `#elevation`    | **stable**       | shadows, card variants, hero accent, z-layers                              |
| Motion            | `#motion`       | **stable**       | Ambient / Response / Celebrate бюджети                                     |
| Форми             | `#forms`        | **stable**       | Button `(variant, tone)`, Input, FormField, Select, Switch                 |
| Фідбек            | `#feedback`     | **stable**       | Badge, Spinner, Skeleton, Avatar, ProgressRing                             |
| Overlays          | `#overlays`     | **stable**       | Modal, Sheet, ConfirmDialog                                                |
| Theming           | `#theming`      | **stable** API   | `useTheme`: light / dark / hc (розділ showcase звірено з хуком 2026-09-16) |
| A11y              | `#a11y`         | **stable**       | focus-visible, touch targets, contrast, motion                             |
| A11y / States     | `#a11y-states`  | **beta**         | semantic a11y-токени: ring, selection, caret, dividers                     |
| Module accents    | `#accents`      | **stable**       | finyk / fizruk / routine / nutrition tokens, стіл/зона                     |
| Menus             | `#menus`        | **stable**       | DropdownMenu, CommandPalette                                               |
| Tooltip & Popover | `#primitives`   | **stable**       | Tooltip, Popover                                                           |
| EmptyState        | `#empty-states` | **stable**       | три tier-и порожніх станів                                                 |
| Proposals ×3      | `#proposals-*`  | **experimental** | пропозиції UI / UX / visual — не контракт                                  |

> Maturity:
> **stable** — API публічний, захищений гейтом або контрактним тестом, безпечний для нового UI.
> **beta** — API може ще зрушити.
> **experimental** — пропозиції; у продуктовий код не брати.

---

## Швидкі лінки на розділи

Нижче — anchor-точки для зворотної сумісності з наявними лінками по репо.
Кожен якір перенаправляє в тематичний файл.

### Принципи та кольори

→ [`design-system/01-tokens-colors.md`](./design-system/01-tokens-colors.md)

- [§1 Принципи](./design-system/01-tokens-colors.md#1-принципи)
- [§2 Кольорові токени](./design-system/01-tokens-colors.md#2-кольорові-токени)
- [§2.1 Семантичні поверхні](./design-system/01-tokens-colors.md#21-семантичні-поверхні)
- [§2.2 Текст](./design-system/01-tokens-colors.md#22-текст)
- [§2.3 Бренд і модулі](./design-system/01-tokens-colors.md#23-бренд-і-модулі)
- [§2.4 Статуси](./design-system/01-tokens-colors.md#24-статуси)
- [§2.5 Data-viz](./design-system/01-tokens-colors.md#25-data-viz-графіки)
- [§9 WCAG AA контраст](./design-system/01-tokens-colors.md#9-wcag-aa-контраст)

### Типографічна шкала

→ [`design-system/02-typography.md`](./design-system/02-typography.md)

- [§3 Типографічна шкала](./design-system/02-typography.md#3-типографічна-шкала)
- [text-style-\* tier-1](./design-system/02-typography.md#семантичні-text-style--ютиліті-tier-1-fluid)
- [Legacy text-\* шкала tier-2 — видалена](./design-system/02-typography.md#legacy-text--шкала-tier-2--видалена)
- [Довгий текст](./design-system/02-typography.md#довгий-текст)

### Spacing, Elevation та Theming

→ [`design-system/03-spacing-elevation-theming.md`](./design-system/03-spacing-elevation-theming.md)

- [§4 Spacing, радіуси, тіні](./design-system/03-spacing-elevation-theming.md#4-spacing-радіуси-тіні)
- [§7 Мобільні брейкпоінти](./design-system/03-spacing-elevation-theming.md#7-мобільні-брейкпоінти)
- [§8 Темна тема + High Contrast](./design-system/03-spacing-elevation-theming.md#8-темна-тема--high-contrast)

### Примітиви UI та Components

→ [`design-system/04-components.md`](./design-system/04-components.md)

- [§5 Примітиви UI](./design-system/04-components.md#5-примітиви-ui)
- [§6 Focus, disabled, loading](./design-system/04-components.md#6-focus-disabled-loading--єдиний-контракт)
- [§10 Coding rules](./design-system/04-components.md#10-coding-rules)
- [§11 Міграційні патерни](./design-system/04-components.md#11-міграційні-патерни)
- [§12 Нові компоненти](./design-system/04-components.md#12-нові-компоненти-2026-04)
- [§13 Нові хуки](./design-system/04-components.md#13-нові-хуки-2026-04)
- [§16 Gestures & a11y](./design-system/04-components.md#16-gestures--a11y-2026-04-batch-3)
- [§18 DropdownMenu та CommandPalette](./design-system/04-components.md#18-dropdownmenu-та-command-palette-2026-05-track-5)
- [§19 Що далі](./design-system/04-components.md#19-що-далі)

### Motion, Animation та Offline/Error

→ [`design-system/05-motion-offline-error.md`](./design-system/05-motion-offline-error.md)

- [§14 Motion & Animation](./design-system/05-motion-offline-error.md#14-motion--animation-2026-05-13)
- [§14.1 Motion tokens](./design-system/05-motion-offline-error.md#141-motion-tokens-css-custom-properties)
- [§14.2 Choreography rules](./design-system/05-motion-offline-error.md#142-choreography-rules)
- [§14.3 prefers-reduced-motion](./design-system/05-motion-offline-error.md#143-prefers-reduced-motion-strategy-wcag-233)
- [§15 Offline / Empty / Error](./design-system/05-motion-offline-error.md#15-offline--empty--error)
