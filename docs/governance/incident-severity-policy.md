# Incident Severity Policy

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

Use this policy to decide when a production symptom becomes an incident and what level of response Sergeant requires.

## When an alert becomes an incident

Treat an alert, error spike, or user report as an incident when at least one is true:

- user-visible core functionality is unavailable or materially degraded
- the failure is still active after one focused triage pass
- data integrity, auth integrity, or external money movement may be wrong
- error-budget burn suggests the event is not transient noise
- rollback, mitigation, or stakeholder communication is now required

If none of those are true yet, start with [investigate-alert.md](../playbooks/investigate-alert.md).

## Severity levels

| Severity | Definition                                                                                                    | Examples                                                                                                      | Response expectation                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| SEV1     | Full outage, data corruption risk, auth/security compromise, or critical user path unavailable for most users | API down, broken login for all, destructive migration issue, duplicate money movement                         | Immediate mitigation or rollback. Start incident log now. Postmortem required.                                                          |
| SEV2     | Major degradation for an important slice of users or a key integration, but partial workarounds still exist   | webhook processor failing, mobile build broken in release lane, elevated 5xx on one major flow                | Same-day mitigation. Incident log required. Postmortem required unless false positive.                                                  |
| SEV3     | Localized regression, degraded non-core functionality, or noisy alert with user impact not yet broad          | one feature page broken, non-critical bot capability failing, sustained elevated latency but healthy fallback | Triage within working day. Incident log required if mitigation spans multiple steps. Postmortem optional but recommended for repeaters. |
| SEV4     | Confirmed issue with no current user impact or transient issue already resolved                               | brief alert flap, one-off background job retry, isolated preview-only prod warning                            | Track in issue/runbook if useful. No postmortem unless pattern repeats.                                                                 |

## Minimum incident log

For SEV1-SEV3, keep one running note in the incident issue, PR, or chat thread with:

- start time and detection source
- affected surface from [service-catalog.md](../architecture/service-catalog.md)
- severity
- current impact
- mitigation/rollback decision
- owner
- verification of recovery

## Postmortem requirement

Create a postmortem when:

- severity is SEV1 or SEV2
- a schema or data recovery step was needed
- the same failure mode has recurred
- the fix required a new runbook, hard rule, or release guardrail

Use [write-postmortem.md](../playbooks/write-postmortem.md) and file the record through [postmortems/INDEX.md](../postmortems/INDEX.md).
