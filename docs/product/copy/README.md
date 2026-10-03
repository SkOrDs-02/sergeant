# Copy

> **Last touched:** 2026-09-17 by @claude (source of truth для strings — `uk.core.ts` + модульні `uk.<module>.ts`, не монолітний `uk.ts`). **Next review:** 2026-12-16.
> **Status:** Active

Канонічні правила UA-копії для всього продукту — tone-of-voice, address-форма, патерни
error-/empty-states. Reference, на який звіряється кожен новий кирилічний JSX-літерал.

## Документи

| Документ                                   | Призначення                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| [`style-guide.uk.md`](./style-guide.uk.md) | Content style guide (UA): 1-ша особа однини для action-busy, `ти`-address, error-копія. |

## Cross-links

- i18n-каталог (source of truth для strings): з 2026-09-12 розкладений на ядро `apps/web/src/shared/i18n/uk.core.ts` (те, що потрібне до першого екрана) + модульні `uk.<module>.ts` (`uk.finyk.ts`, `uk.fizruk.ts`, `uk.nutrition.ts`, `uk.routine.ts`, …); `uk.ts` їх лише зшиває. Новий рядок кладеться в ядро або у файл свого модуля, не в `uk.ts`.
- i18n readiness: [`docs/design/i18n/`](../../design/i18n/README.md).
- Бренд-voice: [`docs/design/design/`](../../design/design/README.md).
