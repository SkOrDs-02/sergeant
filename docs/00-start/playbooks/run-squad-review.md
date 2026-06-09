<!-- AUTO-GENERATED: false — authored playbook -->

# Playbook: Squad review — паралельний PR review через 4 lens-агентів

> **Last validated:** 2026-06-09 by @claude. **Next review:** 2026-09-07.
> **Status:** Active

**Trigger:** PR торкається ≥3 governed surfaces одночасно: SQL migrations, server serializers, web UI, mobile UI, SKILL.md, або HubChat tool defs.

## Prerequisites

1. Stage 1 spec-compliance пройдений (із `sergeant-review-and-merge` — звір diff із spec/issue).
2. `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` увімкнений у `.claude/settings.json`.
3. Версія Claude Code ≥ 2.1.32 (`claude --version`).

## Кроки

### Крок 1 — Завантаж skill

```
Load skill: sergeant-review-squad
```

### Крок 2 — Запусти Agent Team

Запусти команду огляду:

```
Create an agent team to review PR #<number>.
Spawn 4 teammates:
1. contract-reviewer — Hard Rules #1, #3, #4
2. design-reviewer — Hard Rules #8, #9, #11-17
3. security-reviewer — Hard Rules #20, #21, #22
4. docs-reviewer — Hard Rules #10, #15, #25, #26

Give each teammate the PR diff. Ask each to send findings to the lead when done.
```

### Крок 3 — Моніторинг прогресу

В `in-process` mode: використовуй `Shift+Down` для перегляду кожного teammate.
В `tmux` mode: кожен teammate у власному pane.

Не робимо synthesis поки всі 4 не звітували.

### Крок 4 — Synthesis

Після отримання всіх 4 звітів:

- Агрегуй за рівнем ризику: BLOCKER → WARNING → INFO
- Якщо є BLOCKER — PR не мерджити
- Поверни consolidated review comment

### Крок 5 — Stage 2 (code quality)

Після вирішення всіх BLOCKER findings — виконай Stage 2 із `sergeant-review-and-merge`.

## Owner surface

- Primary surface: будь-яка з governed surfaces що зачіпає PR (server, web, mobile, migrations)
- Coupled surface: `packages/api-client` — contract triplet перевіряється contract-reviewer
- Governing skill: `sergeant-review-squad`

## Verification

- [ ] Всі 4 reviewer-агенти (contract, design, security, docs) завершили і надіслали findings
- [ ] Немає BLOCKERs — або вони задокументовані і вирішені перед merge
- [ ] Consolidated review comment виведено за рівнями ризику (BLOCKER → WARNING → INFO)

## Common mistakes

- Запускати lens-review замість Stage 1 (spec-compliance) — lens не замінює Stage 1
- Synthesis до того як усі 4 teammate-и завершили — гарантовано пропущені findings
- Запускати squad на single-surface PR — overkill, достатньо `sergeant-review-and-merge`

## Governing skill

[`sergeant-review-squad`](../../../.agents/skills/sergeant-review-squad/SKILL.md)
