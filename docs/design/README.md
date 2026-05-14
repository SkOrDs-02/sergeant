# Дизайн

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-11.
> **Status:** Active

Брендбук, дизайн-система, спеціалізовані патерни, аудити і tooling.

## Живий styleguide

Сторінка [`/design-showcase`](../../apps/web/src/core/DesignShowcase) (внутрішня,
лише в dev/preview-збірках) — реально живий showcase усіх примітивів:

- сайдбар з 11 розділами (Кольори, Типографіка, Spacing, Elevation, Motion,
  Форми, Фідбек, Overlays, Theming, A11y, Module Accents);
- тогли theme (light/dark/hc), density (comfortable/compact), напрямок (LTR/RTL)
  та reduced-motion override прямо в шапці;
- у кожному розділі — live demo + копі-паст snippet + Do / Don't таблиця +
  pinned Hard Rule + ESLint rule badges.

Якщо щось нове додаєш у `@shared/components/ui` — спочатку онови розділ,
у якому воно живе, а тоді бампай freshness у `design-system.md`.

## Maturity matrix (primitives)

| Розділ         | Maturity   | Showcase якір | Lint                                                                                                   |
| -------------- | ---------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| Кольори        | **stable** | `#colors`     | `no-hex-in-classname`, `valid-tailwind-opacity`, `no-low-contrast-text-on-fill`, `no-raw-dark-palette` |
| Типографіка    | **stable** | `#typography` | `prefer-text-style`, `no-arbitrary-text-size`, `no-eyebrow-drift`, `no-ellipsis-dots`                  |
| Spacing        | **stable** | `#spacing`    | `no-rounded-lg`                                                                                        |
| Elevation      | **stable** | `#elevation`  | —                                                                                                      |
| Motion         | **stable** | `#motion`     | (HR #17 budget — convention only)                                                                      |
| Форми          | **stable** | `#forms`      | `prefer-focus-visible`, `prefer-data-state`                                                            |
| Фідбек         | **stable** | `#feedback`   | `no-bare-empty-text`, `no-ellipsis-dots`                                                               |
| Overlays       | **stable** | `#overlays`   | `prefer-focus-visible`, `prefer-data-state`                                                            |
| Theming        | **beta**   | `#theming`    | `no-raw-dark-palette`, `no-hex-in-classname`                                                           |
| A11y           | **stable** | `#a11y`       | `prefer-focus-visible`, `no-low-contrast-text-on-fill`                                                 |
| Module accents | **stable** | `#accents`    | `no-foreign-module-accent`                                                                             |

`beta` — API ще не зафіксовано (Theming поки що читає лише `useDarkMode`,
шедулер у роботі); `experimental` — поки що порожньо.

## Пріоритет документів

1. [`design-system.md`](./design-system.md) — канонічний контракт для нового UI-коду.
   Якщо патерн / спеціалізована дока конфліктує з дизайн-системою — перемагає
   дизайн-система.
2. Спеціалізовані патерни (`cross-module-prompts.md`, `empty-states.md`,
   `module-accent.md`, `radius-rhythm.md`, `undo-pattern.md`,
   `unified-bottom-nav.md`) — уточнюють конкретні UX-рішення.
3. Аудити (`dark-mode-audit.md`, `brand-palette-wcag-aa-proposal.md` та
   документи в `docs/audits`) — історія рішень і tracker-и.

## Identity / brand

| Документ                         | Опис                                                    |
| -------------------------------- | ------------------------------------------------------- |
| [`brandbook.md`](./brandbook.md) | Бренд-голос, ім'я, hero-градієнти, marketing-references |

## Canonical contract

| Документ                                 | Опис                                                                |
| ---------------------------------------- | ------------------------------------------------------------------- |
| [`design-system.md`](./design-system.md) | Дизайн-система: токени, типографія, компоненти, варіанти, API, lint |

## Спеціалізовані патерни

| Документ                                               | Опис                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| [`cross-module-prompts.md`](./cross-module-prompts.md) | Cross-module nudges із anti-nag-механікою                                 |
| [`empty-states.md`](./empty-states.md)                 | Правила empty / error / zero-data станів (3 tier-и)                       |
| [`module-accent.md`](./module-accent.md)               | Module-accent CSS variables, ESLint containment, Tailwind utilities       |
| [`radius-rhythm.md`](./radius-rhythm.md)               | Size-driven border-radius scale (Swatch / Marker / Control / Card / Hero) |
| [`undo-pattern.md`](./undo-pattern.md)                 | Soft-delete + 5-секундний undo-toast для destructive-дій                  |
| [`unified-bottom-nav.md`](./unified-bottom-nav.md)     | Єдиний bottom-nav патерн для hub / modules                                |

## Tooling / process

| Документ                         | Опис                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| [`storybook.md`](./storybook.md) | Storybook 10 setup, conventions, ESLint `require-stories-for-ui-components` контракт |
| [`specs/`](./specs)              | Design specs для нетривіальних product-side фіч (раніше `agents/specs/`)             |

## Audit / history

| Документ                                                                   | Опис                                                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`dark-mode-audit.md`](./dark-mode-audit.md)                               | Closed audit trail міграції raw dark palette (Wave 1b → 2a → 2b → 2c)  |
| [`brand-palette-wcag-aa-proposal.md`](./brand-palette-wcag-aa-proposal.md) | Implemented: WCAG AA `-strong`-tier для brand palette (PR #851 → #857) |
