# Playbook: Write Postmortem

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** a SEV1/SEV2 incident occurred, a recurring production failure needs formal learning capture, or repo guardrails changed because of an incident.

## Owner surface

- Primary surface: incident learning and follow-up
- Governing skill: `sergeant-review-and-merge`

## Required context

- Review [incident-severity-policy.md](../governance/incident-severity-policy.md), [Postmortem Index](../postmortems/INDEX.md), and [TEMPLATE.md](../postmortems/TEMPLATE.md).

## Steps

### 1. Collect facts before narrative

- Timeline from detection to recovery
- root cause
- mitigation path
- detection gaps
- missing guardrails

### 2. Fill the template

- Be specific about the technical cause.
- Separate what failed from why it escaped.
- Include links to the incident log, release, PR, or rollback reference.

### 3. Create action items

- Each action item needs an owner and due date.
- Route fixes into playbooks, runbooks, hard rules, tests, or infra as appropriate.

### 4. Update the index

- Add the new postmortem entry to [INDEX.md](../postmortems/INDEX.md).
- Link the follow-up issue or tracker item.

## Verification

- [ ] Root cause is concrete
- [ ] Detection and mitigation gaps are called out separately
- [ ] Action items have owners and due dates
- [ ] Index updated

## When not to use this playbook

- The event is a SEV4 transient issue with no meaningful learning value.
- The investigation is still active and facts are incomplete.

## Related playbooks and skills

- [declare-incident.md](./declare-incident.md)
- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- Skill: `sergeant-deploy-and-observability`
