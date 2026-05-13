# Engineering Metrics

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Lightweight process observability for the development system itself. The goal is not vanity metrics; it is to detect friction before it turns into slower delivery, hidden risk, or policy drift.

## Core metrics

| Metric                        | Why it matters                                              | Suggested review cadence | Source                                                   |
| ----------------------------- | ----------------------------------------------------------- | ------------------------ | -------------------------------------------------------- |
| PR lead time                  | Shows how long changes wait between first commit and merge  | Weekly                   | GitHub PRs                                               |
| Review turnaround             | Reveals whether review is the current bottleneck            | Weekly                   | GitHub review timestamps                                 |
| CI failure rate               | Shows instability in default contributor path               | Weekly                   | GitHub Actions                                           |
| Flaky test count              | Measures reliability debt that erodes trust in green builds | Weekly                   | flaky test dashboard, CI reruns                          |
| Docs/governance gate failures | Detects drift in documentation operating system             | Weekly                   | docs/governance CI jobs                                  |
| Postmortem action item aging  | Prevents learning from incidents from going stale           | Weekly                   | postmortem follow-up issues                              |
| Stale feature flags           | Surfaces hidden release debt and dead code                  | Weekly                   | [feature-flags.md](../governance/feature-flags.md)       |
| Open security SLA breaches    | Makes unresolved risk visible                               | Weekly                   | [vulnerability-sla.md](../security/vulnerability-sla.md) |

## Dashboard strategy

- Use one saved GitHub search or project view for open release-affecting PRs.
- Use one saved GitHub search or project view for incident/postmortem follow-up items.
- Keep one CI view pinned to default branch plus release workflows.
- Avoid creating separate dashboards per app until the single weekly review becomes noisy.

## Weekly operator digest

Run a 15-20 minute review once per week:

1. Review PR lead time and review turnaround for the last 7 days.
2. Check CI failure rate and top flaky tests.
3. Review stale feature flags and expired review dates on operational docs.
4. Review open postmortem actions and security SLA exceptions.
5. Decide whether one playbook, runbook, or hard rule needs tightening.

Use [run-weekly-operator-digest.md](../playbooks/run-weekly-operator-digest.md) as the execution checklist.
