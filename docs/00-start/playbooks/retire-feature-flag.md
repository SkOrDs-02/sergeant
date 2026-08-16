# Playbook: Retire Feature Flag

> **Last touched:** 2026-08-16 by @github-actions[bot]. **Next review:** 2026-11-30.
> **Status:** Active

**Trigger:** feature flag завершив rollout, expired, або перетворився на rollout-debt і його треба прибрати з кодової бази та registry.

## Owner surface

- Primary surface: rollout hygiene
- Governing skill: `sergeant-review-and-merge`

## Required context

- Перегляньте [feature-flags.md](../../04-governance/governance/feature-flags.md) і [add-feature-flag.md](./add-feature-flag.md).
- Якщо прапор захищає mobile- або backend-реліз, відкрийте також відповідний release playbook.

## Steps

### 1. Підтвердьте умови retirement

- Rollout-рішення прийнято.
- Жоден активний реліз не покладається на цей прапор як kill switch.
- Default-стан зрозумілий і може стати постійною поведінкою.

### 2. Приберіть прапор end-to-end

- Видаліть запис у registry в коді.
- Приберіть усі `useFlag`, `getFlag` або еквівалентні розгалуження.
- Видаліть тести, що існують лише для старої гілки розгалуження, зберігши покриття поточної поведінки.

### 3. Приберіть operational docs

- Видаліть рядок із [feature-flags.md](../../04-governance/governance/feature-flags.md).
- Оновіть release notes або playbooks, якщо прапор був задокументований як rollback-важіль.

## Verification

- [ ] Прапор видалено з code registry
- [ ] Мертві гілки видалено
- [ ] Запис у registry видалено з `docs/04-governance/governance/feature-flags.md`
- [ ] Verification покриває поведінку, що залишилася

## When not to use this playbook

- Прапор все ще активно керує ризиковим rollout.
- Прапор лише вводиться, а не прибирається.

## Related playbooks and skills

- [add-feature-flag.md](./add-feature-flag.md)
- [cleanup-dead-code.md](./cleanup-dead-code.md)
- [release.md](./release.md)

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                   | Merged     |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | ---------- |
| [#799](https://github.com/Skords-01/Sergeant/pull/799) | fix(finyk-domain): одна таблиця ручних категорій і колір для надходжень | 2026-08-16 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
