# Playbook: Run Weekly Operator Digest

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** weekly operating review for repo health, release discipline, incidents, and process friction.

## Owner surface

- Primary surface: engineering operating system
- Governing skill: `sergeant-review-and-merge`

## Required context

- Review [engineering-metrics.md](../observability/engineering-metrics.md), [feature-flags.md](../feature-flags.md), and [review-checklist.md](../governance/review-checklist.md).

## Steps

### 1. Review flow metrics

- PR lead time
- review turnaround
- CI failure rate
- flaky test count

### 2. Review operating debt

- stale feature flags
- aging postmortem actions
- docs/governance gates that failed during the week
- open security SLA exceptions

### 3. Pick one tightening action

- update one playbook
- tune one alert/runbook
- retire one stale flag
- fix one recurring CI pain point

## Verification

- [ ] Metrics reviewed for the last 7 days
- [ ] One operating debt item selected for action
- [ ] Any needed follow-up issue or PR opened

## When not to use this playbook

- You are handling an active production incident.
- You only need a single release checklist, not a weekly operating review.

## Related playbooks and skills

- [release-web-and-api.md](./release-web-and-api.md)
- [write-postmortem.md](./write-postmortem.md)
- [retire-feature-flag.md](./retire-feature-flag.md)
