# Sergeant Agent Workflows

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Стислі decision trees для найважливіших агентних сценаріїв у Sergeant.

## 1. Feature Delivery

1. Start with `sergeant-start-here`.
2. Load `sergeant-feature-delivery`.
3. Pick one specialist skill for the touched surface.
4. If placement is unclear, use `sergeant-monorepo-boundaries` before writing files.
5. If change is product-facing or non-trivial, write/update spec in `docs/design/specs/`.
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

## 7. Squad Review (PR touches 3+ governed surfaces)

1. Start with `sergeant-start-here`.
2. Load `sergeant-review-and-merge`; complete Stage 1 (spec compliance) first.
3. Load `sergeant-review-squad`.
4. Create Agent Team with 4 teammates: `contract-reviewer`, `design-reviewer`, `security-reviewer`, `docs-reviewer`.
5. Give each teammate the PR diff and their Hard Rule scope.
6. Wait for all 4 reports before synthesizing.
7. Synthesize findings ordered by production risk: BLOCKER → WARNING → INFO.
8. Apply Stage 2 (code quality) only after all BLOCKER findings are resolved.

## 8. Squad Deliver (cross-surface feature, 2+ surfaces with contract dependencies)

1. Start with `sergeant-start-here`.
2. Load `sergeant-feature-delivery` for overall delivery discipline.
3. Load `sergeant-deliver-squad` for multi-surface coordination.
4. Sequential: run `migration-agent` if schema changes needed.
5. Sequential: run `server-agent` with migration report as context.
6. Sequential: run `api-client-agent` with server response shape as context.
7. Parallel (if both surfaces touched): spawn `web-agent` + `mobile-agent` as Agent Team.
8. Run `pnpm typecheck && pnpm test` after all agents complete.

## 9. Squad QA (full cross-surface test validation)

1. Start with `sergeant-start-here`.
2. Load `sergeant-qa-squad`.
3. Create Agent Team with 4 teammates: `qa-server`, `qa-web`, `qa-mobile`, `qa-openclaw`.
4. All 4 run independently in parallel.
5. Wait for all 4 reports before synthesizing.
6. Synthesize: overall status + per-surface table + failure details.
7. For any failures: load `sergeant-bugfix-and-regression` + `fix-failing-ci.md`.

## 6. OpenClaw Gateway Change

1. Start with `sergeant-start-here`.
2. Load `sergeant-openclaw`.
3. If the change also modifies HubChat tool defs or executors → also load `sergeant-hubchat`.
4. If the change requires Railway env vars or health verification → also load `sergeant-deploy-and-observability`.
5. `pnpm --filter @sergeant/openclaw-plugin build` locally before pushing.
6. After deploy: verify `sergeant-openclaw-gateway` Railway service health + test `@OpenClaw_sergeant_v2_bot` responds.
