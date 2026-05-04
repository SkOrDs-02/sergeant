# Security Incident Policy

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Active

Use this policy when the incident is primarily about identity compromise, privileged misuse, leaked credentials, or unauthorized access to sensitive systems.

## Security incident vs runtime incident

A security incident is the primary mode when at least one is true:

- a maintainer, admin, or machine account may be compromised
- a provider key, bot token, or admin credential may be leaked
- unauthorized access to GitHub, Railway, Vercel, Stripe, mobile-store, DNS, or database surfaces is suspected
- logs, support reports, or vendor alerts suggest privileged misuse rather than ordinary runtime failure

If the event is only service degradation without access compromise, use [incident-severity-policy.md](./incident-severity-policy.md) and the runtime playbooks.

## Severity guidance

| Severity | Security examples                                                                                                    | Required first actions                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| SEV1     | Stolen GitHub owner session, production DB admin compromise, Stripe admin compromise, DNS takeover                   | Lock account/session, revoke access, rotate impacted credentials, freeze blast radius, open incident log immediately |
| SEV2     | Leaked provider key, suspicious Railway/Vercel admin access, compromised bot token with mutation capability          | Revoke or rotate credential same day, inventory affected systems, verify no follow-on mutation occurred              |
| SEV3     | Temporary contractor over-privileged, suspicious but unconfirmed vendor login, stale access discovered during review | Reduce access promptly, investigate evidence, open issue or incident note if mitigation spans multiple steps         |
| SEV4     | Benign alert, quickly explained login anomaly, read-only access hygiene issue with no current exploit path           | Track and remediate through review/backlog if useful                                                                 |

## Required first actions

1. Freeze blast radius.
   - lock or sign out the suspected account if possible
   - revoke membership or disable token first, investigate second
2. Rotate impacted credentials.
   - use [rotate-secrets.md](../playbooks/rotate-secrets.md) when secret rotation is involved
3. Capture evidence.
   - vendor audit logs
   - timestamps
   - affected surfaces from [access-matrix.md](../security/access-matrix.md)
4. Open one canonical incident log.
5. Verify recovery and least-privilege state before closing.

## Notification threshold

Escalate to user/vendor/legal review if:

- billing or payout surfaces may have been touched
- auth/account data may have been exposed
- external users may need to reset credentials or be informed of account-impacting changes
- vendor support is needed to reconstruct account history or revoke privileged sessions

## Postmortem requirement

A postmortem is mandatory when:

- severity is SEV1 or SEV2
- a privileged surface changed state during the event
- credential rotation or access cleanup required coordinated multi-system action
- the incident exposed missing access policy, ownership, or review guardrails

## Canonical routes

- [access-governance.md § Suspected account compromise](../playbooks/access-governance.md#4-suspected-account-compromise)
- [rotate-secrets.md](../playbooks/rotate-secrets.md)
- [write-postmortem.md](../playbooks/write-postmortem.md)
