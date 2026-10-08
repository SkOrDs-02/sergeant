# Ops

> **Last touched:** 2026-10-03 by @claude (Renovate-runbook прибрано: лишився тільки Dependabot, ADR-0103). **Next review:** 2027-01-01.
> **Status:** Active

Operational maintainer-runbook-и для recurring-чергових процесів (scheduled
scans, weekly housekeeping). Доповнюють incident-flow runbooks
у [`docs/start/instructions/`](../../start/instructions/README.md): тут — рутина, там — incident-handling.
Рутина оновлення залежностей (PR Dependabot) описана в
[`dependabot-usage.md`](../../engineering/integrations/dependabot-usage.md).

## Документи

| Документ                                             | Призначення                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`docker-image-policy.md`](./docker-image-policy.md) | Політика runtime-образу Hub API (`Dockerfile.api`): distroless-база, CVE-бюджет Trivy, healthcheck. |

## Ops vs runbooks vs playbooks

| Папка                                    | Призначення                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `docs/start/instructions/`               | Канонічні кроки під конкретний trigger (release, incident, fix-failing-CI).              |
| `docs/start/instructions/`               | Як виконати infra-операцію на нашому стеку (restore-from-backup, key-rotation, replica). |
| `docs/operations/ops/` (**цей каталог**) | Recurring-чергова рутина — щотижнева, щомісячна, scheduled-scan triage.                  |

## Cross-links

- ADR-0103 — [Dependabot — єдиний інструмент оновлення залежностей](../../governance/adr/0103-dependabot-only-dependency-updates.md) (замінив ADR-0044 «Renovate vs Dependabot»).
- Робота з PR Dependabot (рев'ю, ігнор, security-PR): [`docs/engineering/integrations/dependabot-usage.md`](../../engineering/integrations/dependabot-usage.md).
- Dependabot config: [`.github/dependabot.yml`](../../../.github/dependabot.yml).
