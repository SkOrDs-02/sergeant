# Playbook: Release Expo Mobile

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** ship a new `apps/mobile` build, EAS update, or release-channel change for the Expo native app.

## Owner surface

- Primary surface: Expo mobile runtime
- Governing skill: `sergeant-mobile-expo`

## Required context

- Start with `sergeant-start-here`, then open `sergeant-mobile-expo`.
- Review [service-catalog.md](../architecture/service-catalog.md), [platforms.md](../architecture/platforms.md), and [release-policy.md](../governance/release-policy.md).

## Steps

### 1. Classify the mobile release

- Determine whether this is an OTA/channel update, a new build, or both.
- Confirm whether the release depends on new API behavior or feature flags.

### 2. Prepare rollout

- Capture build or update identifiers.
- Record target channel, cohort, and rollback method.
- Make sure auth bootstrap and one mobile-only flow are part of the smoke plan.

### 3. Execute release

- Ship the build or update to the intended lane.
- Verify that the correct config/env was used.
- If the release depends on server changes, coordinate with [release-web-and-api.md](./release-web-and-api.md).

### 4. Verify and monitor

- Install or update the published artifact.
- Run auth, one primary screen load, and one mobile-only interaction.
- Watch crash/error signals and support feedback during rollout.

## Verification

- [ ] Channel/build identifiers recorded
- [ ] Rollback path documented
- [ ] Auth and one mobile-only flow tested
- [ ] Server dependency ordering confirmed when applicable

## When not to use this playbook

- The release target is the Capacitor shell rather than Expo.
- The change is only in shared packages with no mobile deploy.

## Related playbooks and skills

- [release-web-and-api.md](./release-web-and-api.md)
- [port-web-screen-to-mobile.md](./port-web-screen-to-mobile.md)
- Skill: `sergeant-deploy-and-observability`
