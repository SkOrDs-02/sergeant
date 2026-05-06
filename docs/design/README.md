# Дизайн

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

Брендбук, дизайн-система, спеціалізовані патерни, аудити і tooling.

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
