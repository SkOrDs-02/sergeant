# Playbook: Revoke Privileged Access

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** offboarding, role reduction, expired contractor access, or a decision that an actor no longer needs privileged access to a Sergeant surface.

## Owner surface

- Primary surface: privileged access governance
- Governing skill: `sergeant-review-and-merge`

## Required context

- Review [access-policy.md](../security/access-policy.md), [access-matrix.md](../security/access-matrix.md), and [secret-ownership-register.md](../security/secret-ownership-register.md).
- If compromise is suspected, switch to [respond-to-suspected-account-compromise.md](./respond-to-suspected-account-compromise.md).

## Steps

### 1. Identify all affected surfaces

- List every vendor, environment, and machine credential touched by the actor.
- Confirm whether any access was indirect through shared project membership or release tooling.

### 2. Revoke vendor access first

- Remove membership, role, or token access on the documented surfaces.
- Prefer immediate removal to "we will clean it later".

### 3. Rotate if needed

- If the actor had access to shared credentials, recovery mailboxes, or exportable secrets, rotate the impacted secret groups.
- Use [rotate-secrets.md](./rotate-secrets.md) for the rotation path.

### 4. Verify recovery paths remain valid

- Confirm the documented owner still exists for each affected surface.
- Confirm at least one legitimate maintainer can still recover the system.

## Verification

- [ ] All documented surfaces checked
- [ ] Vendor access removed
- [ ] Secret rotation triggered where needed
- [ ] Recovery ownership still valid after revoke

## When not to use this playbook

- The actor still needs reduced but active access; use the grant playbook to re-scope deliberately.
- The event is an active compromise requiring incident handling.

## Related playbooks and skills

- [grant-privileged-access.md](./grant-privileged-access.md)
- [respond-to-suspected-account-compromise.md](./respond-to-suspected-account-compromise.md)
- [rotate-secrets.md](./rotate-secrets.md)
