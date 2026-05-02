# Playbook: Respond to Suspected Account Compromise

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** suspicious admin login, leaked maintainer session, suspicious vendor-console activity, or any sign that a privileged account or machine credential may be compromised.

## Owner surface

- Primary surface: security incident response for privileged access
- Governing skill: `sergeant-deploy-and-observability`

## Required context

- Review [security-incident-policy.md](../governance/security-incident-policy.md), [access-matrix.md](../security/access-matrix.md), and [secret-ownership-register.md](../security/secret-ownership-register.md).
- Keep [rotate-secrets.md](./rotate-secrets.md) ready if credential rotation is required.

## Steps

### 1. Classify and freeze

- Name the affected privileged surface.
- Estimate severity using the security incident policy.
- Disable or sign out the suspected account or token first if the platform allows it.

### 2. Inventory blast radius

- Identify what systems the account or credential could touch.
- Capture timestamps, vendor audit logs, and any suspicious actions.

### 3. Revoke and rotate

- Remove the compromised or suspicious access.
- Rotate any secret or token that may have been exposed.
- If multiple surfaces are linked, coordinate the order explicitly.

### 4. Open the incident log

- Record severity, affected surfaces, mitigation path, and verification steps.
- If user, billing, or auth impact is plausible, note the notification decision.

### 5. Verify recovery

- Confirm least-privilege state is restored.
- Confirm service owners and recovery paths remain valid.
- Route to [write-postmortem.md](./write-postmortem.md) when required.

## Verification

- [ ] Affected surface named
- [ ] Severity recorded
- [ ] Account or token revoked/disabled
- [ ] Related credentials rotated where needed
- [ ] Incident log opened
- [ ] Recovery ownership still intact

## When not to use this playbook

- The event is only a normal revoke or contractor offboarding.
- The issue is purely runtime degradation with no access-compromise angle.

## Related playbooks and skills

- [rotate-secrets.md](./rotate-secrets.md)
- [declare-incident.md](./declare-incident.md)
- [write-postmortem.md](./write-postmortem.md)
- [revoke-privileged-access.md](./revoke-privileged-access.md)
