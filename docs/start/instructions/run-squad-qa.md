<!-- AUTO-GENERATED: false — authored playbook -->

# Playbook: Squad QA — паралельний QA по всіх surfaces

> **Last touched:** 2026-09-17 by @claude. **Next review:** 2026-12-16. _(4 teammates: додано `qa-packages`.)_
> **Status:** Active
> **Runtime-specific:** no

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
Spawn 4 teammates:
1. qa-server — apps/server tests and typecheck
2. qa-web — apps/web + apps/landing tests and typecheck
3. qa-mobile — apps/mobile + mobile-shell tests and typecheck
4. qa-packages — packages/* workspaces, incl. api-client contract tests (Hard Rule #3)

All run independently. Report to the lead when done.
```

### Крок 3 — Чекай на всі 4 звіти

Не роби synthesis поки всі 4 не відзвітували.

### Крок 4 — Synthesis

Після отримання всіх 4 звітів:

- Зведений статус: `🟢 All surfaces green` або `🔴 Failures in: [список]`
- Per-surface таблиця: Tests / Typecheck / Failures
- Деталі failures з файлом тесту і причиною
- Якщо `qa-packages` червоний — спершу перевір, чи не він пояснює падіння app-поверхонь (`shared` / `*-domain` — upstream для web і mobile)

### Крок 5 — Fix failures

Якщо є failures — завантаж `sergeant-bugfix-and-regression` і `fix-failing-ci.md` playbook для кожної зламаної surface.

## Owner surface

- Primary surface: `apps/server`, `apps/web`, `apps/landing`, `apps/mobile`, `apps/mobile-shell`, `packages/*`
- Coupled surface: n/a — паралельна перевірка незалежних surfaces
- Governing skill: `sergeant-qa-squad`

## Verification

- [ ] Всі 4 qa-агенти (server, web, mobile, packages) завершили і надіслали звіт
- [ ] Synthesis містить per-surface таблицю Tests / Typecheck / Failures
- [ ] Зелений статус (`🟢 All surfaces green`) або failures передані до `sergeant-bugfix-and-regression`

## Коли НЕ використовувати

- Для звичайного pre-PR check — `pnpm check` достатньо і швидше
- Для single-surface перевірки — `pnpm --filter @sergeant/<surface> test` напряму

## Governing skill

[`sergeant-qa-squad`](../../../.agents/skills/sergeant-qa-squad/SKILL.md)
