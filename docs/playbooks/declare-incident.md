# Playbook: Declare Incident

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** a production issue has moved beyond alert triage and now requires explicit severity, owner, mitigation, or rollback coordination.

## Owner surface

- Primary surface: incident coordination
- Governing skill: `sergeant-deploy-and-observability`

## Required context

- Start with `sergeant-start-here`, then open `sergeant-deploy-and-observability`.
- Review [incident-severity-policy.md](../governance/incident-severity-policy.md) and [service-catalog.md](../architecture/service-catalog.md).

## Steps

### 1. Classify severity

- Use the severity matrix, not intuition alone.
- Record affected surface, impact, and confidence.

### 2. Open one incident log

- Use the PR, issue, or ops thread that will remain the canonical timeline.
- Record start time, owner, current mitigation path, and the next verification check.

### 3. Stabilize

- Decide between rollback, feature-flag mitigation, env rollback, or targeted hotfix.
- Minimize blast radius before deeper cleanup.

### 4. Verify recovery

- Confirm the symptom is gone on the affected surface.
- Watch the related alert/metric long enough to avoid a false recovery claim.

### 5. Route follow-up

- If postmortem is required, immediately open [write-postmortem.md](./write-postmortem.md).
- If the issue was only a noisy alert, update the runbook or alert tuning note.

## Verification

- [ ] Severity recorded
- [ ] Canonical incident log exists
- [ ] Mitigation or rollback decision recorded
- [ ] Recovery verified on the user-facing surface or metric

## When not to use this playbook

- The event is still only an investigation with no confirmed user impact or mitigation need.
- The issue is purely local CI or staging noise.

## Related playbooks and skills

- [investigate-alert.md](./investigate-alert.md)
- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- [write-postmortem.md](./write-postmortem.md)
- Skill: `sergeant-bugfix-and-regression`
