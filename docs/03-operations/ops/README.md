# Ops

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-09.
> **Status:** Active

Operational maintainer-runbook-и для recurring-чергових процесів (dependency
hygiene, scheduled scans, weekly housekeeping). Доповнюють incident-flow runbooks
у [`docs/03-operations/runbooks/`](../runbooks/README.md): тут — рутина, там — incident-handling.

## Документи

| Документ                                             | Призначення                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`renovate.md`](./renovate.md)                       | Понеділкова рутина review-у Renovate-PR-ів, monthly hygiene, Mend downtime escalation. ADR-0044.    |
| [`docker-image-policy.md`](./docker-image-policy.md) | Політика runtime-образу Hub API (`Dockerfile.api`): distroless-база, CVE-бюджет Trivy, healthcheck. |

## Ops vs runbooks vs playbooks

| Папка                                       | Призначення                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `docs/00-start/playbooks/`                  | Канонічні кроки під конкретний trigger (release, incident, fix-failing-CI).              |
| `docs/03-operations/runbooks/`              | Як виконати infra-операцію на нашому стеку (restore-from-backup, key-rotation, replica). |
| `docs/03-operations/ops/` (**цей каталог**) | Recurring-чергова рутина — щотижнева, щомісячна, scheduled-scan triage.                  |

## Cross-links

- ADR-0044 — [Renovate vs Dependabot](../../04-governance/adr/0044-renovate-vs-dependabot.md).
- Contributor view of Renovate: [`docs/02-engineering/integrations/renovate-usage.md`](../../02-engineering/integrations/renovate-usage.md).
- Renovate config: [`renovate.json`](../../../renovate.json).
- Dependabot config: [`.github/dependabot.yml`](../../../.github/dependabot.yml).
