# Playbook: Run Access Review

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

**Trigger:** periodic access review for Tier 0 and Tier 1 systems, or a governance sweep after staffing, vendor, or infra changes.

## Owner surface

- Primary surface: privileged access governance
- Governing skill: `sergeant-review-and-merge`

## Required context

- Review [access-matrix.md](../security/access-matrix.md), [access-policy.md](../security/access-policy.md), and [secret-ownership-register.md](../security/secret-ownership-register.md).

## Steps

### 1. Review Tier 0 surfaces

- Verify owner is still correct.
- Verify holder list is still justified.
- Remove any stale, redundant, or undocumented access.

### 2. Review Tier 1 surfaces

- Look for over-privileged roles where read-only would be enough.
- Look for stale contractors or machine credentials without a clear purpose.
- Confirm every surface still has one owner.

### 3. Record actions

- Open revoke follow-ups for stale access.
- Open rotation follow-ups for ambiguous shared credentials.
- Update the matrix or ownership register if a new surface appeared.

## Verification

- [ ] Every Tier 0 surface reviewed
- [ ] Every Tier 1 surface reviewed
- [ ] Stale contractors and unused machine credentials checked
- [ ] Follow-up items opened for drift

## When not to use this playbook

- A single urgent compromise is active right now.
- You only need to grant or revoke one isolated access request.

## Related playbooks and skills

- [grant-privileged-access.md](./grant-privileged-access.md)
- [revoke-privileged-access.md](./revoke-privileged-access.md)
- [run-weekly-operator-digest.md](./run-weekly-operator-digest.md)
