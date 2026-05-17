# Design archive

> **Last validated:** 2026-05-17 by @Skords-01.
> **Next review:** at-need (статичний архів; оновлюється тільки коли новий аудит закривається).
> **Status:** Archive.

Закриті аудити та реалізовані пропозиції. Файли тут — **історичний контекст**:
trace рішення, контрастні таблиці, migration waves, посилання на PR-и.
Жоден з цих документів не є **живим контрактом** для нового коду.

Живий контракт:

- Кольорова система та `-strong`-тіри → [`../brandbook.md`](../brandbook.md) § WCAG-AA `-strong` Tier
- Кольорові токени, dark/HC поведінка, ESLint guardrails → [`../design-system.md`](../design-system.md)

## Файли

| Документ                                                                   | Статус                   | Закрито    | Підсумок                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`dark-mode-audit.md`](./dark-mode-audit.md)                               | **Closed** (audit trail) | 2026-05-13 | Wave 1b → 2a → 2b → 2c міграція `dark:`-overrides у семантичні токени. ESLint `no-raw-palette-light-dark-pairs` піднято до `error`, нуль violations. Reference for HR #13.                                                                                                                                                                                                                                                                       |
| [`brand-palette-wcag-aa-proposal.md`](./brand-palette-wcag-aa-proposal.md) | **Implemented**          | 2026-05-13 | WCAG AA `-strong`-tier додано для brand/accent/status/module families (PR [#851](https://github.com/Skords-01/Sergeant/pull/851) → [#854](https://github.com/Skords-01/Sergeant/pull/854) → [#855](https://github.com/Skords-01/Sergeant/pull/855) → [#857](https://github.com/Skords-01/Sergeant/pull/857)). Reference for HR #9 та [`../../adr/0007-tailwind-opacity-and-strong-tier.md`](../../adr/0007-tailwind-opacity-and-strong-tier.md). |

## Чому архів, а не видалення

Обидва документи активно цитуються з governance:

- Hard-rule [`../../governance/rules/09-saturated-brand-fills-strong-companion.md`](../../governance/rules/09-saturated-brand-fills-strong-companion.md) → `brand-palette-wcag-aa-proposal.md`
- Hard-rule [`../../governance/rules/13-no-raw-palette-light-dark-pairs.md`](../../governance/rules/13-no-raw-palette-light-dark-pairs.md) → `dark-mode-audit.md`
- ADR [`../../adr/0007-tailwind-opacity-and-strong-tier.md`](../../adr/0007-tailwind-opacity-and-strong-tier.md) → `brand-palette-wcag-aa-proposal.md`

Видалення зруйнує контекст “чому це правило існує”.
