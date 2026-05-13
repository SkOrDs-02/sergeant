# Ops

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

Operational maintainer-runbook-и для recurring-чергових процесів (dependency
hygiene, scheduled scans, weekly housekeeping). Доповнюють incident-flow runbooks
у [`docs/runbooks/`](../runbooks/README.md): тут — рутина, там — incident-handling.

## Документи

| Документ                       | Призначення                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| [`renovate.md`](./renovate.md) | Понеділкова рутина review-у Renovate-PR-ів, monthly hygiene, Mend downtime escalation. ADR-0044. |

## Ops vs runbooks vs playbooks

| Папка                         | Призначення                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `docs/playbooks/`             | Канонічні кроки під конкретний trigger (release, incident, fix-failing-CI).              |
| `docs/runbooks/`              | Як виконати infra-операцію на нашому стеку (restore-from-backup, key-rotation, replica). |
| `docs/ops/` (**цей каталог**) | Recurring-чергова рутина — щотижнева, щомісячна, scheduled-scan triage.                  |

## Cross-links

- ADR-0044 — [Renovate vs Dependabot](../adr/0044-renovate-vs-dependabot.md).
- Contributor view of Renovate: [`docs/integrations/renovate-usage.md`](../integrations/renovate-usage.md).
- Renovate config: [`renovate.json`](../../renovate.json).
- Dependabot config: [`.github/dependabot.yml`](../../.github/dependabot.yml).
