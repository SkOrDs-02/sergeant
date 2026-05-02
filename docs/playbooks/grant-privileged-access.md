# Playbook: Grant Privileged Access

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** a founder, core engineer, contractor, or machine account needs new privileged access to a documented Sergeant surface.

## Owner surface

- Primary surface: privileged access governance
- Governing skill: `sergeant-review-and-merge`

## Required context

- Review [access-policy.md](../security/access-policy.md) and [access-matrix.md](../security/access-matrix.md).
- If the request touches secrets or machine credentials, also review [secret-ownership-register.md](../security/secret-ownership-register.md).

## Steps

### 1. Confirm the request is valid

- Name the exact surface.
- Name the requested access tier.
- Record the business reason.
- Confirm a lower tier cannot solve the need.

### 2. Confirm holder type and ownership

- Classify the holder: founder, core engineer, temporary contractor, or machine account.
- Confirm the surface owner approves the grant.
- If temporary, set explicit expiry before access is granted.

### 3. Grant the minimum viable access

- Use the vendor role or credential scope that matches the minimum tier.
- Avoid personal admin escalation when read-only or scoped project access is enough.
- Do not create undocumented shared accounts.

### 4. Record the grant

- Update the access note, ticket, or PR with:
  - surface
  - holder
  - tier
  - owner
  - reason
  - expiry if temporary

## Verification

- [ ] Surface and tier named explicitly
- [ ] Lower tier ruled out
- [ ] Owner approval recorded
- [ ] Expiry recorded for temporary access
- [ ] Grant recorded in an issue, PR, or ops note

## When not to use this playbook

- The issue is a suspected compromise or urgent revoke scenario.
- The change is only rotating a secret for an existing owner.

## Related playbooks and skills

- [revoke-privileged-access.md](./revoke-privileged-access.md)
- [run-access-review.md](./run-access-review.md)
- [rotate-secrets.md](./rotate-secrets.md)
