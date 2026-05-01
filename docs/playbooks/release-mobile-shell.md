# Playbook: Release Mobile Shell

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** ship a new `apps/mobile-shell` build or any release where the Capacitor shell, store metadata, or native wrapper behavior changes.

## Owner surface

- Primary surface: Capacitor mobile shell
- Governing skill: `sergeant-deploy-and-observability`

## Required context

- Start with `sergeant-start-here`, then open `sergeant-deploy-and-observability`.
- Review [platforms.md](../architecture/platforms.md), [service-catalog.md](../architecture/service-catalog.md), and [release-policy.md](../governance/release-policy.md).

## Steps

### 1. Confirm release scope

- Separate shell-only changes from embedded web changes.
- If web artifact changed too, coordinate with [release-web-and-api.md](./release-web-and-api.md).
- Confirm whether iOS, Android, or both need shipping.

### 2. Prepare release notes and rollback

- Record build numbers and version bump.
- Document store lane, staged rollout choice, and prior stable build reference.
- Verify whether any feature flag or server-side kill switch can reduce blast radius.

### 3. Build and submit

- Produce the release candidate build.
- Smoke test install, launch, auth bootstrap, and one critical deep-link or notification path.
- Submit to the intended store lane or internal track.

### 4. Post-release verification

- Confirm availability in the target lane.
- Re-run install/open smoke on the published build.
- Monitor crash and auth signals after rollout begins.

## Verification

- [ ] Version/build numbers recorded
- [ ] Prior stable build reference available
- [ ] One install + auth smoke completed
- [ ] Store lane and rollout strategy documented

## When not to use this playbook

- The primary change is in the Expo native app.
- The change is only a server or web deploy without a new shell build.

## Related playbooks and skills

- [release-web-and-api.md](./release-web-and-api.md)
- [release-expo-mobile.md](./release-expo-mobile.md)
- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- Skill: `sergeant-web-ui`
