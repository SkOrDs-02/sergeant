---
lang: en
lang-reason: Superseded stub kept only as historical anchor (`Status: Deprecated`); body redirects to `access-governance.md § Grant privileged access`. Translating a 308-style stub to UA adds no signal — the canonical playbook is what gets read. Tracked under initiative 0009 PR 1.2b.
---

# Playbook: Grant Privileged Access

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Deprecated

> **Superseded by:** [access-governance.md § Grant privileged access](./access-governance.md#1-grant-privileged-access) — merged 2026-05-04 (initiative [0009](../initiatives/0009-agent-os-hardening.md) PR 2.4).

**Trigger:** historical anchor — open [access-governance.md § Grant privileged access](./access-governance.md#1-grant-privileged-access) instead.

## Owner surface

- Primary surface: privileged access governance
- Governing skill: `sergeant-review-and-merge`

## Why this stub still exists

The merged [access-governance.md](./access-governance.md) playbook now owns grant, revoke, periodic review, and suspected-compromise paths together. This file stays in the repo so external bookmarks, audit logs, and historical PR/incident references keep resolving without 404s, and so `git blame` on the original steps remains intact.

Do not extend this stub. Update [access-governance.md](./access-governance.md) and let this file follow.

## Steps

See [access-governance.md § Grant privileged access](./access-governance.md#1-grant-privileged-access).

## Verification

- [ ] The reader was redirected to [access-governance.md § Grant privileged access](./access-governance.md#1-grant-privileged-access).

## When not to use this playbook

- Always: this file is deprecated. Use [access-governance.md](./access-governance.md).

## Related playbooks and skills

- [access-governance.md](./access-governance.md) — canonical merged access playbook.
- [rotate-secrets.md](./rotate-secrets.md)
- Skill: `sergeant-review-and-merge`
