# Playbook: Тижневий operator-дайджест

> **Last touched:** 2026-08-16 by @github-actions[bot]. **Next review:** 2026-12-06.
> **Status:** Active

**Trigger:** щотижневий операційний огляд (operating review) здоров'я репозиторію, релізної дисципліни, інцидентів і процесного тертя (process friction).

## Owner surface

- Primary surface: інженерна операційна система (engineering operating system).
- Governing skill: `sergeant-review-and-merge`.

## Потрібний контекст

- Перегляньте [engineering-metrics.md](../../03-operations/observability/engineering-metrics.md), [feature-flags.md](../../04-governance/governance/feature-flags.md) і [review-checklist.md](../../04-governance/governance/review-checklist.md).
- ADR-0082 (2026-07-30) зняв частину солоперевізьких крон-гейтів (`security-sla-reminder`, `docs-freshness`/`skill-freshness` календарні прогони) — solo-maintainer посадка не тримає окремого дашборду для них. Кроки нижче спираються на файли й живі workflow-и, що лишились після цього ADR.

## Кроки

### 1. Перегляньте метрики потоку (flow)

- час від відкриття PR до мерджу (англ. lead time)
- час реакції на ревʼю (англ. review turnaround)
- частота падінь CI за тиждень (англ. CI failure rate)
- кількість «флакі»-тестів (нестабільних) за останні 7 днів
- джерело: вкладка Actions репозиторію + [`docs/04-governance/pr-ledger/index.json`](../../04-governance/pr-ledger/index.json) (мердж-історія, оновлюється Hard Rule #26 при кожному PR, що чіпає canonical docs).

### 2. Перегляньте операційний борг (operating debt)

- застарілі feature-прапори, які час прибрати — [feature-flags.md](../../04-governance/governance/feature-flags.md)
- прострочені пункти дій з post-mortem-ів і прострочені `Next review` дати — [`docs/open-work.md`](../../open-work.md) (генерується `pnpm docs:gen-open-work`, входить у `pnpm docs:gen-daily`; актуальність — ручний `workflow_dispatch` [`docs-daily-brief.yml`](../../../.github/workflows/docs-daily-brief.yml), календарний cron знято 2026-07-09 навмисно, щоб не палити Actions-хвилини solo-мейнтейнеру)
- CI-гейти, що падали протягом тижня — перевір живі nightly/weekly cron-workflow-и: [`nightly-audit.yml`](../../../.github/workflows/nightly-audit.yml) (щодня 03:00 UTC), [`container-scan.yml`](../../../.github/workflows/container-scan.yml) (щодня 04:00), [`pact-drift.yml`](../../../.github/workflows/pact-drift.yml) (щодня 06:00), [`post-deploy-smoke.yml`](../../../.github/workflows/post-deploy-smoke.yml) (щодня 06:30), [`extended-e2e.yml`](../../../.github/workflows/extended-e2e.yml) (щодня 02:00), [`codeql.yml`](../../../.github/workflows/codeql.yml), [`mutation-testing.yml`](../../../.github/workflows/mutation-testing.yml), [`mobile-flaky-verify.yml`](../../../.github/workflows/mobile-flaky-verify.yml) (усі три — щопонеділка), [`db-backup-verify.yml`](../../../.github/workflows/db-backup-verify.yml) (щонеділі). `docs-freshness.yml`/`skill-freshness.yml` — тепер PR-only гейти (ADR-0082 §5, без окремого календарного прогону), дивись на них через історію PR, а не окремий дашборд.
- відкриті винятки з безпекового SLA — [`audit-exceptions.md`](../../04-governance/security/audit-exceptions.md) (ledger waived CVE). `security-sla-reminder` крон, що раніше штовхав це автоматично, знято ADR-0082 §3 (retired як reviewer-oriented гейт без другого рев'юера в петлі) — перевіряй файл вручну щотижня саме тут.

### 3. Оберіть одну посилюючу (tightening) дію

- оновіть один playbook
- підкрутіть один alert або runbook
- ретайрніть один застарілий feature-прапор
- закрийте одну повторювану CI-проблему (recurring CI pain point)

## Verification

- [ ] Метрики переглянуті за останні 7 днів
- [ ] Один пункт операційного боргу обрано для дії
- [ ] Відкрито потрібний follow-up issue або PR

## Коли цей playbook НЕ використовувати

- Ви обробляєте активний продакшн-інцидент — використовуйте `declare-incident.md`.
- Вам потрібен лише релізний чеклист, а не щотижневий операційний огляд — використовуйте `release.md`.

## Споріднені playbook-и та skills

- [release.md](./release.md)
- [write-postmortem.md](./write-postmortem.md)
- [retire-feature-flag.md](./retire-feature-flag.md)

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                   | Merged     |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | ---------- |
| [#799](https://github.com/Skords-01/Sergeant/pull/799) | fix(finyk-domain): одна таблиця ручних категорій і колір для надходжень | 2026-08-16 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
