---
lang: en
lang-reason: Superseded stub kept only as historical anchor (`Status: Deprecated`); body redirects to `release.md § Mobile shell (Capacitor)`. Translating a 308-style stub to UA adds no signal — the canonical playbook is what gets read. Tracked under initiative 0009 PR 1.2b.
---

# Playbook: Release Mobile Shell

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Deprecated

> **Superseded by:** [release.md § Mobile shell (Capacitor)](./release.md#2-mobile-shell-capacitor) — merged 2026-05-04 (initiative [0009](../initiatives/0009-agent-os-hardening.md) PR 2.3).

**Trigger:** historical anchor — open [release.md § Mobile shell (Capacitor)](./release.md#2-mobile-shell-capacitor) instead.

## Owner surface

- Primary surface: Capacitor mobile shell
- Governing skill: `sergeant-deploy-and-observability`

## Why this stub still exists

The merged [release.md](./release.md) playbook now owns the Capacitor shell release loop alongside web/API and Expo flows. This file stays in the repo so external bookmarks, audit logs, and historical PR/incident references keep resolving without 404s, and so `git blame` on the original steps remains intact.

Do not extend this stub. Update [release.md](./release.md) and let this file follow.

## Steps

See [release.md § Mobile shell (Capacitor)](./release.md#2-mobile-shell-capacitor).

## Verification

- [ ] The reader was redirected to [release.md § Mobile shell (Capacitor)](./release.md#2-mobile-shell-capacitor).

## When not to use this playbook

- Always: this file is deprecated. Use [release.md](./release.md).

## Related playbooks and skills

- [release.md](./release.md) — canonical merged release playbook.
- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- Skill: `sergeant-deploy-and-observability`
