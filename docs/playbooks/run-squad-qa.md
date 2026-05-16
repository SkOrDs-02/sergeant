<!-- AUTO-GENERATED: false — authored playbook -->
# Playbook: Squad QA — паралельний QA по всіх surfaces

> **Last validated:** 2026-05-16 by @Skords-01. **Next review:** 2026-08-14.
> **Status:** Active

## Trigger

Використовуй цей playbook перед release, після великого рефактора, або коли потрібен per-surface звіт про стан тестів (не лише агрегований pass/fail).

## Prerequisites

1. `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` увімкнений у `.claude/settings.json`.
2. Версія Claude Code ≥ 2.1.32 (`claude --version`).

## Кроки

### Крок 1 — Завантаж skill

```
Load skill: sergeant-qa-squad
```

### Крок 2 — Запусти Agent Team

```
Create an agent team for full QA across all Sergeant surfaces.
Spawn 4 teammates:
1. qa-server — apps/server tests and typecheck
2. qa-web — apps/web tests and typecheck
3. qa-mobile — apps/mobile unit tests and typecheck
4. qa-openclaw — tools/openclaw tests and typecheck

All run independently. Report to the lead when done.
```

### Крок 3 — Чекай на всі 4 звіти

Не роби synthesis поки всі 4 не відзвітували. В `in-process` mode: `Shift+Down` для навігації між teammates.

### Крок 4 — Synthesis

Після отримання всіх 4 звітів:
- Зведений статус: `🟢 All surfaces green` або `🔴 Failures in: [список]`
- Per-surface таблиця: Tests / Typecheck / Failures
- Деталі failures з файлом тесту і причиною

### Крок 5 — Fix failures

Якщо є failures — завантаж `sergeant-bugfix-and-regression` і `fix-failing-ci.md` playbook для кожної зламаної surface.

## Коли НЕ використовувати

- Для звичайного pre-PR check — `pnpm check` достатньо і швидше
- Для single-surface перевірки — `pnpm --filter @sergeant/<surface> test` напряму

## Governing skill

[`sergeant-qa-squad`](../../.agents/skills/sergeant-qa-squad/SKILL.md)
