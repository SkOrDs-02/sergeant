# Playbook: Retire Feature Flag

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** a feature flag has graduated, expired, or become dead rollout debt and should be removed from the codebase and registry.

## Owner surface

- Primary surface: rollout hygiene
- Governing skill: `sergeant-review-and-merge`

## Required context

- Review [feature-flags.md](../feature-flags.md) and [add-feature-flag.md](./add-feature-flag.md).
- If the flag protects a mobile or backend release, also open the relevant release playbook.

## Steps

### 1. Confirm retirement conditions

- The rollout decision is done.
- No active release still relies on the flag as a kill switch.
- The default state is understood and can become permanent behavior.

### 2. Remove the flag end-to-end

- Delete the registry entry in code.
- Remove all `useFlag`, `getFlag`, or equivalent branching.
- Remove tests that only exist for the old branch split, while preserving behavior coverage.

### 3. Clean the operational docs

- Remove the row from [feature-flags.md](../feature-flags.md).
- Update release notes or playbooks if the flag was documented as a rollback lever.

## Verification

- [ ] Flag removed from code registry
- [ ] Dead branches removed
- [ ] Registry entry removed from `docs/feature-flags.md`
- [ ] Verification still covers the surviving behavior

## When not to use this playbook

- The flag is still actively controlling a risky rollout.
- The flag is only being introduced, not removed.

## Related playbooks and skills

- [add-feature-flag.md](./add-feature-flag.md)
- [cleanup-dead-code.md](./cleanup-dead-code.md)
- [release-web-and-api.md](./release-web-and-api.md)
