# Postmortem: [INCIDENT TITLE]

> **This is a blameless postmortem.** Focus on systems and processes, not on individuals. The goal is to learn and prevent recurrence, not to assign blame.

|                        |                             |
| ---------------------- | --------------------------- |
| **Incident ID**        | INC-YYYY-NNN                |
| **Date**               | YYYY-MM-DD                  |
| **Severity**           | SEV1 / SEV2 / SEV3 / SEV4   |
| **Status**             | Draft / In review / Final   |
| **Duration**           | Xh Ym (detected → resolved) |
| **Authors**            | @handle                     |
| **Incident commander** | @handle                     |
| **On-call**            | @handle                     |
| **Reviewers**          | @handle, @handle            |

> **Severity guide:** SEV1 — full outage / data loss · SEV2 — major degradation, many users affected · SEV3 — partial degradation, workaround exists · SEV4 — minor, internal-only.

## Summary

_2–4 sentences a stakeholder can read in 30 seconds. What happened, who was affected, how it ended._

## Impact

- **Users affected:** ~N (% of active users)
- **Customer-facing duration:** Xh Ym
- **Requests failed / data lost:** N requests · N records
- **SLO budget consumed:** X %
- **Revenue / contractual impact:** $ / none
- **Public communication:** status page · email · none

## Detection

- **Detected at:** HH:MM UTC
- **Time to detect (TTD):** Xm (incident start → first signal)
- **How:** alert `AlertName` · customer report · internal report · dashboard
- **Was the alert appropriate?** yes / no — _why_

## Timeline (UTC)

| Time  | Event                                |
| ----- | ------------------------------------ |
| HH:MM | Change deployed / inciting event     |
| HH:MM | Alert fired: `AlertName`             |
| HH:MM | On-call acknowledged                 |
| HH:MM | Incident channel opened (`#inc-...`) |
| HH:MM | Hypothesis: ...                      |
| HH:MM | Mitigation applied: ...              |
| HH:MM | User-facing impact ended             |
| HH:MM | Resolved · all-clear                 |

## Trigger

_The specific event that started the incident (deploy, config change, traffic spike, dependency failure)._

## Root cause

_The underlying reason the trigger caused an incident. Use 5 whys if helpful — go past the symptom to the system property that allowed this._

## Contributing factors

_Things that didn't cause the incident on their own but made it worse, longer, or harder to detect (missing alert, stale runbook, single point of failure, recent process change)._

## Mitigation & resolution

- **Mitigation steps:** _what stopped the bleeding (rollback, feature flag off, scale up, restart, ...)._
- **Resolution steps:** _what made the system fully healthy again._
- **Time to mitigate (TTM):** Xm · **Time to resolve (TTR):** Xm

## What went well

-

## What went wrong / where we got lucky

-

## Action items

> Each item must have an owner, a deadline, and a tracking issue. `Type` = `prevent` (stops recurrence) · `detect` (finds it faster) · `mitigate` (reduces impact) · `process` (people / docs).

| #   | Action | Type    | Priority | Owner   | Deadline   | Issue |
| --- | ------ | ------- | -------- | ------- | ---------- | ----- |
| 1   |        | prevent | P1       | @handle | YYYY-MM-DD | #123  |

## Lessons learned

_1–3 paragraphs of generalizable takeaways — patterns that apply beyond this specific incident._

## References

- Incident channel: `#inc-...`
- Sentry issue: [link]
- GitHub issue: [link]
- Related PR: [link]
- Dashboards / logs: [link]
- Runbook used: [link]
