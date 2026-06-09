# Дизайн

> **Last validated:** 2026-06-09 by @claude. **Next review:** 2026-09-07.
> **Status:** Active

Брендбук, дизайн-система, спеціалізовані патерни, активний v2-rollout і архів закритих аудитів.

## Як знайти потрібне

- **Канонічний контракт для нового UI-коду** → [`design-system.md`](./design-system.md).
- **Бренд (голос, ім'я, палітра)** → [`brandbook.md`](./brandbook.md).
- **Активний v2 редизайн (rollout, migration, live status, backlog)** → [`redesign-v2/`](./redesign-v2/README.md).
- **Спеціалізовані UX-патерни** → таблиця нижче.
- **Закриті аудити та реалізовані пропозиції (для governance-trace)** → [`archive/`](./archive/README.md).
- **Product-side design specs** → [`specs/`](./specs/README.md).

## v2 redesign (травень 2026)

Sergeant v2 редизайн (foundation merged 2026-05) додав parallel v2 token
namespace (glass surfaces, mesh background, ink-strong, Manrope шрифт,
22 нові Lucide icons, AIPill / InsightCard AI surfaces). Legacy `--c-*`
токени лишилися активні — нічого не зламано. Весь кластер винесено в
підпапку [`redesign-v2/`](./redesign-v2/README.md): 5 файлів (governance,
migration, execution-plan, live execution-status, backlog) плюс index,
що підказує куди йти cold.

## Живий styleguide

Сторінка [`/design-showcase`](../../../apps/web/src/core/DesignShowcase) (внутрішня,
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
3. v2-rollout кластер (`redesign-v2/`) — переходи на v2 поверх дизайн-системи.
4. Архів (`archive/`, `specs/archive/`) — закриті аудити та superseded specs.
   Жоден з цих файлів не є живим контрактом — лише історичний контекст
   для governance-посилань.

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

## Archive

Закриті аудити та реалізовані пропозиції — повний індекс і підсумки кожного у [`archive/README.md`](./archive/README.md). Файли тут лишені як **історичний контекст** для governance-посилань (HR #9, HR #13, ADR-0007), не як живий контракт.

| Документ                                                                                   | Статус      |
| ------------------------------------------------------------------------------------------ | ----------- |
| [`archive/dark-mode-audit.md`](./archive/dark-mode-audit.md)                               | Closed      |
| [`archive/brand-palette-wcag-aa-proposal.md`](./archive/brand-palette-wcag-aa-proposal.md) | Implemented |
