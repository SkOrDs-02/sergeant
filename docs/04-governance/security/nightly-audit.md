# Nightly-audit — потік triage

> **Last touched:** 2026-08-24 by @claude. **Next review:** 2027-09-05.
> **Status:** Active

## Огляд

Workflow `.github/workflows/nightly-audit.yml` запускається щоночі о 03:00 UTC (+ ручний `workflow_dispatch`). Він **не блокує PR-flow** — це окремий trend-signal для глибшого аналізу залежностей.

### Job-и

| Job                       | Що робить                                                                                                                                     | Коли fail                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **pnpm-audit-full**       | `pnpm audit --json` (повний звіт, включно з low/medium) + ledger-gate через `scripts/ci/audit-exceptions.mjs`                                 | critical або high без чинного винятку |
| **osv-scanner**           | OSV-Scanner v2.3.5: сканує lockfile + всі package.json рекурсивно. SARIF → GitHub code-scanning + ledger-gate через `scripts/ci/osv-gate.mjs` | critical/high без чинного винятку     |
| **snyk** _(опціональний)_ | Тільки якщо є `SNYK_TOKEN` secret. `snyk test --all-projects --severity-threshold=high`                                                       | high+ знайдено                        |
| **notify-failure**        | При failure будь-якого з вищих: створює/оновлює GitHub issue з labels `nightly-audit-failed` + `security`; тіло називає, який саме лейн упав  | —                                     |
| **notify-recovered**      | Коли всі три лейни зелені — **закриває** відкритий issue з коментарем                                                                         | —                                     |

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

1. Задокументуй виняток у [docs/04-governance/security/audit-exceptions.md](./audit-exceptions.md) — з `Due date`.
2. Обидва лейни (`pnpm audit` і OSV) читають **той самий** ledger, тож окремий `.osv-scanner.toml` більше не потрібен.
3. Issue закриється **сам** наступним зеленим прогоном — руками закривати не треба.

### 5. Перевір тренди

- **GitHub Security tab** → Code Scanning: фільтр по tool `osv-scanner` показує тренд вразливостей.
- **Артефакти** (30 днів): завантаж `pnpm-audit.json` з різних runs для порівняння.

## Чому обидва лейни ledger-aware (2026-08-23)

До 2026-08-23 крок «Check for vulnerabilities» валив джобу `osv-scanner` за
**будь-якого** ненульового коду виходу сканера — тобто за будь-якої вразливості
будь-якої severity, включно з давно задокументованими в `audit-exceptions.md`.
У репо стабільно 7 відомих advisory (4 high — усі з чинними винятками, 1
moderate, 2 low), тож джоба падала щоночі, а `notify-failure` щоночі оновлював
той самий issue. За місяць він жодного разу не змінив стану — і перестав
означати «щось НОВЕ зламалось».

Це рівно той стан «червоний завжди = вимкнений», що описаний в
[AGENTS.md § Performance budgets](../../../AGENTS.md#performance-budgets) на
прикладі мовчазного size-limit. Гейт, який світиться червоним незалежно від
змін, не ловить нову вразливість — вона тоне серед старих.

Тепер OSV-лейн проходить через `scripts/ci/osv-gate.mjs` із тією самою
політикою, що й pnpm-лейн:

- severity береться з `pnpm audit --json` (SARIF від osv-scanner емітить усі
  results рівнем `warning`, тож його `level` для гейта непридатний);
- блокують лише `critical`/`high` — `moderate`/`low` трекаються, але збірку не
  валять;
- `high` проходить лише за наявності **непростроченого** запису в ledger-і;
- advisory, невідомий `pnpm audit` (нова вразливість чи інша екосистема),
  блокує: невідоме ≠ безпечне;
- «critical ніколи не waive-иться» лишається на `audit-exceptions.mjs` — саме
  він має надійну severity.

Практичний наслідок: найближче червоне — 2026-09-01, коли спливе виняток на
`react-router` (GHSA-QWWW-VCR4-C8H2, `Due date` 2026-08-31). Це вже реальний
сигнал, а не фон.

## Відмінності від PR-audit (ci.yml)

|                      | PR-audit (ci.yml)                        | Nightly audit                                       |
| -------------------- | ---------------------------------------- | --------------------------------------------------- |
| **Тригер**           | push/PR                                  | schedule + dispatch                                 |
| **Блокує PR**        | Так (high+)                              | Ні                                                  |
| **Scope**            | `--audit-level=high` (production + full) | Повний звіт (всі severity)                          |
| **Dependency check** | Тільки pnpm registry                     | pnpm + OSV database (transitive, GitHub advisories) |
| **SARIF**            | Ні                                       | Так (code-scanning)                                 |
| **Escape hatch**     | Датований запис у `audit-exceptions.md`  | Датований запис у `audit-exceptions.md`             |

## Перехресні посилання

- [docs/04-governance/security/audit-exceptions.md](./audit-exceptions.md) — винятки з аудиту.
- [docs/04-governance/security/vulnerability-sla.md](./vulnerability-sla.md) — SLA-матриця.
- AGENTS.md → секція CI — загальний опис CI workflows.
