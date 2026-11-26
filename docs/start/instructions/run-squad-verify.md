<!-- AUTO-GENERATED: false — authored playbook -->

# Playbook: Squad Verify — робітники й незалежний перевіряльник

> **Last touched:** 2026-11-26 by @claude. **Next review:** 2027-02-26.
> **Status:** Active
> **Runtime-specific:** no

**Trigger:** Треба довести твердження про живий застосунок (розрахунки сходяться, дефект є, дані не губляться) так, щоб йому можна було довіряти: автор доказу і той, хто його перевіряє, мають бути різними агентами.

## Prerequisites

1. Локальний стенд піднятий і перевірений: API, прод-білд web у `vite preview`, база. Рецепт: [`local-environment.md`](../../engineering/testing/verification/local-environment.md).
2. Для кожного робітника є окрема тека результатів поза деревом репо.
3. Субагенти доступні (Claude Code: `Agent` tool). Agent Teams не потрібні: перевіряльник стартує після робітників, а не поруч.

## Кроки

### Крок 1 — Завантаж skill

```
Load skill: sergeant-verify-squad
```

### Крок 2 — Запусти робітників паралельно

```
Use the oracle-worker subagent definition, one instance per module.
Run them in parallel in the background. Give each: the module, the
stand URLs and DB access, the environment traps, the minimum list of
checks, and its own output directory.
```

У дорученні кожному: мета і заборони, адреси стенда, пастки середовища, мінімальний перелік перевірок із межами, тека і форма `result.json`.

### Крок 3 — Чекай на всі звіти

Якщо робітник надсилає той самий звіт удруге, він зациклився на власній фоновій задачі: зупини його, результат уже у файлах.

### Крок 4 — Запусти перевіряльника

```
Use the oracle-verifier subagent definition. Give it the output
directories and the list of claimed defects as claims to test, not as
conclusions. Ask it to rule each one CONFIRMED / REFUTED / NOT VERIFIED.
```

### Крок 5 — Synthesis

- Таблиця по модулях: збіглося / розбіжності / не піддається перевірці, і чи довіряє перевіряльник результату.
- Кожна заявлена знахідка з вердиктом перевіряльника.
- Окремо: чого не покрито.

### Крок 6 — Запиши результат

У реєстр знахідок іде лише `CONFIRMED`. Прогін і докази оформлюються через `pnpm verification` за [README верифікації](../../engineering/testing/verification/README.md).

## Owner surface

- Primary surface: живий стенд `apps/web` + `apps/server`
- Coupled surface: `docs/work/specs/audits/verification/` (реєстр знахідок і прогони)
- Governing skill: `sergeant-verify-squad`

## Verification

- [ ] Усі робітники відзвітували, у кожного є `result.json` і скрипти відтворення
- [ ] Перевіряльник дав вердикт по кожній заявленій знахідці
- [ ] У реєстр записано лише підтверджене; непокрите назване явно

## Коли НЕ використовувати

- Для тестів і типів — `sergeant-qa-squad` або `pnpm check`
- Для ревʼю дифу — `sergeant-review-squad`
- Для одного прогону одного лейну — запусти лейн напряму

## Governing skill

[`sergeant-verify-squad`](../../../.agents/skills/sergeant-verify-squad/SKILL.md)
