---
lang: en
lang-reason: Superseded stub kept only as historical anchor (`Status: Deprecated`); body redirects to `release.md § Expo`. Translating a 308-style stub to UA adds no signal — the canonical playbook is what gets read. Tracked under initiative 0009 PR 1.2b.
---

# Playbook: Release Expo Mobile

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Deprecated

> **Superseded by:** [release.md § Expo](./release.md#3-expo) — merged 2026-05-04 (initiative [0009](../initiatives/archive/_0009-agent-os-hardening.md) PR 2.3).

**Trigger:** historical anchor — open [release.md § Expo](./release.md#3-expo) instead.

## Owner surface

- Primary surface: Expo mobile runtime
- Governing skill: `sergeant-mobile-expo`

## Why this stub still exists

The merged [release.md](./release.md) playbook now owns the Expo release loop alongside web/API and Capacitor shell flows. This file stays in the repo so external bookmarks, audit logs, and historical PR/incident references keep resolving without 404s, and so `git blame` on the original steps remains intact.

Do not extend this stub. Update [release.md](./release.md) and let this file follow.

## Steps

See [release.md § Expo](./release.md#3-expo).

## Verification

- [ ] The reader was redirected to [release.md § Expo](./release.md#3-expo).

## When not to use this playbook

- Always: this file is deprecated. Use [release.md](./release.md).

## Related playbooks and skills

- [release.md](./release.md) — canonical merged release playbook.
- [port-web-screen-to-mobile.md](./port-web-screen-to-mobile.md)
- Skill: `sergeant-mobile-expo`
- Skill: `sergeant-deploy-and-observability`
