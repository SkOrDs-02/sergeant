# Playbook: Release Web and API

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** ship a release-affecting change to `apps/web`, `apps/server`, or both; especially when deploy order, env changes, feature flags, or migrations matter.

## Owner surface

- Primary surface: web and API runtime
- Governing skill: `sergeant-deploy-and-observability`

## Required context

- Start with `sergeant-start-here`, then open `sergeant-deploy-and-observability`.
- Review [service-catalog.md](../architecture/service-catalog.md) and [release-policy.md](../governance/release-policy.md).
- If a migration is involved, also open [add-sql-migration.md](./add-sql-migration.md).

## Steps

### 1. Classify the release

- Identify whether the change is merge-only, coordinated, or high-risk.
- Name the touched surfaces and deploy targets in the PR.
- Confirm rollback path before merging.

### 2. Freeze the deploy order

- Apply env changes before code only if the new values are backward-compatible.
- Apply migrations before app deploy only when the schema change is additive and backward-compatible.
- Deploy API before web if the UI depends on new contract behavior.
- Deploy web before API only when the API is fully backward-compatible and the UI is the risky surface.

### 3. Verify release gates

- CI for the changed surfaces is green.
- No blocking incident or red error budget on the same dependency chain unless this release is the mitigation.
- Feature flags and kill switches are documented.

### 4. Execute deploy

- Merge intentionally.
- Deploy in the documented order.
- Keep a note of the deployment IDs or release references used.

### 5. Run post-release verification

- Check `/health` and one user-critical flow end-to-end.
- Verify error rates, latency, and Sentry noise on the changed surfaces.
- Confirm the feature flag state matches the rollout plan.

## Verification

- [ ] Primary surface named in the PR
- [ ] Deploy order documented
- [ ] Rollback path documented
- [ ] `/health` and one critical user journey checked after deploy
- [ ] Any migration/env ordering captured in the PR or release note

## When not to use this playbook

- Change is docs-only or internal-only with no runtime effect.
- Mobile store or EAS release is the primary surface.

## Related playbooks and skills

- [release-mobile-shell.md](./release-mobile-shell.md)
- [release-expo-mobile.md](./release-expo-mobile.md)
- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- Skill: `sergeant-server-api`
- Skill: `sergeant-web-ui`
