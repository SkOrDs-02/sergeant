# Postmortem Index

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

Index of incident reviews and follow-up expectations.

## How to use

1. Open [TEMPLATE.md](./TEMPLATE.md) for the write-up format.
2. Use [incident-severity-policy.md](../governance/incident-severity-policy.md) to confirm whether a postmortem is required.
3. Add a new row here in the same PR or incident follow-up that adds the postmortem document.
4. Track the follow-up issues until closed or explicitly accepted as debt.

## Records

| Date                           | Incident / Title | Severity | Surface | Postmortem doc | Follow-up tracker |
| ------------------------------ | ---------------- | -------- | ------- | -------------- | ----------------- |
| _No published postmortems yet_ |                  |          |         |                |                   |

## Quality bar

- Root cause is specific, not "human error" or "bad deploy".
- Detection gap and mitigation gap are documented separately.
- Each action item has an owner and due date.
- The relevant runbook, playbook, or hard rule is updated if the failure exposed missing guardrails.
