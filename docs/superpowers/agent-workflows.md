# Sergeant Agent Workflows

> **Last validated:** 2026-05-01 by @codex. **Next review:** 2026-07-30.
> **Status:** Active

Стислі decision trees для найважливіших агентних сценаріїв у Sergeant.

## 1. Feature Delivery

1. Start with `sergeant-start-here`.
2. Load `sergeant-feature-delivery`.
3. Pick one specialist skill for the touched surface.
4. If placement is unclear, use `sergeant-monorepo-boundaries` before writing files.
5. If change is product-facing or non-trivial, write/update spec in `docs/superpowers/specs/`.
6. Add tests first for the changed behavior.
7. Implement the smallest end-to-end slice.
8. Verify and update only the canonical docs that changed.

## 2. Bugfix / Regression

1. Start with `sergeant-start-here`.
2. Load `sergeant-bugfix-and-regression`.
3. Reproduce the failure before changing code.
4. Add a failing test or reproducible verification step.
5. Load the owning specialist skill.
6. Land the minimal fix and re-run the original reproduction plus one nearby regression check.

## 3. PR Review / Merge

1. Start with `sergeant-start-here`.
2. Load `sergeant-review-and-merge`.
3. Check repo hard rules for the touched surfaces.
4. Pull in a specialist skill only if the diff touches a governed area like migrations, HubChat, auth, deploy, or API contracts.
5. Report findings by production risk first, then coverage, then maintainability.

## 4. Database / Migration Change

1. Start with `sergeant-start-here`.
2. Load `sergeant-data-and-migrations`.
3. Decide whether the change is additive or requires two-phase rollout.
4. Generate the migration, verify numbering, and run local migration checks.
5. If response shape changes, also load `sergeant-server-api`.
6. Review merge readiness with migration safety in mind.

## 5. Release / Deploy / Runtime Change

1. Start with `sergeant-start-here`.
2. Load `sergeant-deploy-and-observability`.
3. Check which env vars, health checks, or docs are part of the contract.
4. Verify runtime behavior, not just compile success.
5. Update deploy or observability docs in the same change when operator behavior moves.
