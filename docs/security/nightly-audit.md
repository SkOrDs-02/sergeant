# Nightly-audit — потік triage

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

## Огляд

Workflow `.github/workflows/nightly-audit.yml` запускається щоночі о 03:00 UTC (+ ручний `workflow_dispatch`). Він **не блокує PR-flow** — це окремий trend-signal для глибшого аналізу залежностей.

### Job-и

| Job                       | Що робить                                                                                                 | Коли fail                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **pnpm-audit-full**       | `pnpm audit --json` (повний звіт, включно з low/medium)                                                   | critical або high знайдено        |
| **osv-scanner**           | OSV-Scanner v2.3.5: сканує lockfile + всі package.json рекурсивно. SARIF → GitHub code-scanning           | critical/high (SARIF level=error) |
| **snyk** _(опціональний)_ | Тільки якщо є `SNYK_TOKEN` secret. `snyk test --all-projects --severity-threshold=high`                   | high+ знайдено                    |
| **notify-failure**        | При failure будь-якого з вищих: створює/оновлює GitHub issue з labels `nightly-audit-failed` + `security` | —                                 |

### Артефакти (retention 30 днів)

- `pnpm-audit-report` — `pnpm-audit.json` (повний JSON-звіт)
- `osv-scanner-sarif` — `osv-scanner.sarif` (SARIF для трендів + завантажений у Security > Code Scanning)
- `snyk-report` — `snyk-report.json` (якщо Snyk увімкнено)

## Що робити, коли nightly fail

### 1. Перевір issue

Workflow автоматично створює/оновлює issue з title "Nightly audit failure" та labels `nightly-audit-failed`, `security`. Посилання на run є в тілі issue.

### 2. Відкрий workflow run

Перейди за посиланням у issue → Actions tab → переглянь, які jobs зафейлились.

### 3. Triage за severity

| Severity       | Дія                                                                                     | SLA        |
| -------------- | --------------------------------------------------------------------------------------- | ---------- |
| **Critical**   | Негайний фікс або mitigation. Створи окремий `security:critical` issue.                 | 24 години  |
| **High**       | Створи `security:high` issue, assignee = on-call.                                       | 14 днів    |
| **Medium/Low** | Тільки якщо pnpm-audit показав — вони не блокують job, але варто зафіксувати у backlog. | 30/90 днів |

### 4. Якщо фікс неможливий зараз

1. Задокументуй виняток у [docs/security/audit-exceptions.md](./audit-exceptions.md).
2. Якщо це transitive dependency без патчу — додай до osv-scanner config (`.osv-scanner.toml`) з обгрунтуванням.
3. Закрий nightly issue з коментарем-поясненням.

### 5. Перевір тренди

- **GitHub Security tab** → Code Scanning: фільтр по tool `osv-scanner` показує тренд вразливостей.
- **Артефакти** (30 днів): завантаж `pnpm-audit.json` з різних runs для порівняння.

## Відмінності від PR-audit (ci.yml)

|                      | PR-audit (ci.yml)                        | Nightly audit                                       |
| -------------------- | ---------------------------------------- | --------------------------------------------------- |
| **Тригер**           | push/PR                                  | schedule + dispatch                                 |
| **Блокує PR**        | Так (high+)                              | Ні                                                  |
| **Scope**            | `--audit-level=high` (production + full) | Повний звіт (всі severity)                          |
| **Dependency check** | Тільки pnpm registry                     | pnpm + OSV database (transitive, GitHub advisories) |
| **SARIF**            | Ні                                       | Так (code-scanning)                                 |
| **Escape hatch**     | `audit-exception` label                  | Документація в audit-exceptions.md                  |

## Перехресні посилання

- [docs/security/audit-exceptions.md](./audit-exceptions.md) — винятки з аудиту.
- [docs/security/vulnerability-sla.md](./vulnerability-sla.md) — SLA-матриця.
- `.github/workflows/security-sla-reminder.yml` — щотижневий SLA reminder.
- AGENTS.md → секція CI — загальний опис CI workflows.
