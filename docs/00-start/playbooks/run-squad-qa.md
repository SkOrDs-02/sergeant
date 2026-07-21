<!-- AUTO-GENERATED: false — authored playbook -->

# Playbook: Squad QA — паралельний QA по всіх surfaces

> **Last validated:** 2026-06-09 by @claude. **Next review:** 2026-09-07.
> **Status:** Active

**Trigger:** Перед release, після великого рефактора, або коли потрібен per-surface звіт про стан тестів (не лише агрегований pass/fail).

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
Spawn 3 teammates:
1. qa-server — apps/server tests and typecheck
2. qa-web — apps/web tests and typecheck
3. qa-mobile — apps/mobile + mobile-shell tests and typecheck

All run independently. Report to the lead when done.
```
*(OpenClaw `qa-openclaw` removed — ADR-0075 decommission.)*

### Крок 3 — Чекай на всі 3 звіти

Не роби synthesis поки всі 3 не відзвітували.

### Крок 4 — Synthesis

Після отримання всіх 3 звітів:

- Зведений статус: `🟢 All surfaces green` або `🔴 Failures in: [список]`
- Per-surface таблиця: Tests / Typecheck / Failures
- Деталі failures з файлом тесту і причиною

### Крок 5 — Fix failures

Якщо є failures — завантаж `sergeant-bugfix-and-regression` і `fix-failing-ci.md` playbook для кожної зламаної surface.

## Owner surface

- Primary surface: `apps/server`, `apps/web`, `apps/mobile`, `apps/mobile-shell`
- Coupled surface: n/a — паралельна перевірка незалежних surfaces
- Governing skill: `sergeant-qa-squad`

## Verification

- [ ] Всі 3 qa-агенти (server, web, mobile) завершили і надіслали звіт
- [ ] Synthesis містить per-surface таблицю Tests / Typecheck / Failures
- [ ] Зелений статус (`🟢 All surfaces green`) або failures передані до `sergeant-bugfix-and-regression`

## Коли НЕ використовувати

- Для звичайного pre-PR check — `pnpm check` достатньо і швидше
- Для single-surface перевірки — `pnpm --filter @sergeant/<surface> test` напряму

## Governing skill

[`sergeant-qa-squad`](../../../.agents/skills/sergeant-qa-squad/SKILL.md)
