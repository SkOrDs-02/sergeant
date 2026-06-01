# Sergeant Agent Workflows

> **Last validated:** 2026-06-01 by @claude. **Next review:** 2026-08-30.
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

## 10. Docs Governance Audit / Dedup

1. Start with `sergeant-start-here`.
2. Load `sergeant-tech-debt` for stale docs / duplicate tracker cleanup, or `sergeant-review-and-merge` for PR-readiness governance checks.
3. If the user explicitly asks for agents, run `docs-governance-auditor`.
4. Ask it to inspect active trackers, source audits, canonical-owner links, generated catalogs, and lifecycle/header drift.
5. Implement only after the auditor returns concrete file/status recommendations.
6. Regenerate affected generated docs (`docs:gen-open-work`, `docs:gen-playbook-index`, `docs:gen-graph`) and run the matching `--check` scripts.

## 6. OpenClaw Gateway Change

1. Start with `sergeant-start-here`.
2. Load `sergeant-openclaw`.
3. If the change also modifies HubChat tool defs or executors → also load `sergeant-hubchat`.
4. If the change requires Railway env vars or health verification → also load `sergeant-deploy-and-observability`.
5. `pnpm --filter @sergeant/openclaw-plugin build` locally before pushing.
6. After deploy: verify `sergeant-openclaw-gateway` Railway service health + test `@OpenClaw_sergeant_v2_bot` responds.

## 11. Docs-Sync Sweep (parallel reconcile across `docs/`)

Use when the trigger is «check that docs aren't lagging behind code» / «reconcile drift and execute open doc tasks across the whole `docs/` tree», and the surface is broad (initiatives + planning + audits + launch + security). Canonical recipe: [`docs/playbooks/reconcile-doc-drift.md`](../playbooks/reconcile-doc-drift.md). This workflow adds the **parallel fan-out** layer on top of that single-document playbook.

1. Start with `sergeant-start-here`; load `sergeant-tech-debt` (governing skill for docs hygiene).
2. **Inventory (serial, once).** Regenerate every dashboard so drift is computed against live state, not cache:
   - `pnpm docs:gen-daily` (open-work + today + trust-badge), `pnpm docs:gen-initiative-followups`.
   - Run the code-derived catalog `--check`s to surface "docs lagging code": `docs:check-symbols`, `docs:check-repo-map`, `docs:check-service-catalog`, `docs:check-graph`, `docs:check-architecture-diagrams`. Any failure = regenerate with the matching `gen` script (mechanical, safe).
   - Run the docs-derived `--check`s: `docs:check-open-work`, `docs:check-initiative-followups`, `docs:check-freshness-cadence`, `docs:check-links`.
3. **Split the inventory into disjoint surfaces** so parallel agents never touch the same file. One owner per tracker directory: `docs/initiatives`, `docs/planning`, `docs/audits` + `docs/security/hardening`, `docs/launch`. **Never** hand an agent an `AUTO-GENERATED` file (`open-work.md`, `follow-ups.md`, `today.md`, `*.auto.json`, `symbol-index.*`) — those are regenerated in step 5, not edited.
4. **Fan out (parallel).** Spawn one read-only analysis agent per surface. Each agent: for every `Active`/`In progress`/`Draft` doc in its directory, (a) check whether all `#NNNN` PR-mentions are merged (`docs/pr-ledger/index.json`); (b) grep `main` for evidence that `- [ ]` items are actually shipped; (c) return **precise, evidence-backed edits only** — which checkboxes to flip to `- [x]`, which `> **Status:**` headers to close, which `Next review` dates are stale. Conservative bias: when evidence is ambiguous, leave the doc unchanged and report it as "needs human". Do **not** archive in this sweep (archival is a separate, ≥90-day-gated pass — see playbook §5).
5. **Apply + regenerate (serial).** Apply the high-confidence edits, then regenerate the dashboards (`pnpm docs:gen-daily`, `pnpm docs:gen-initiative-followups`) so closed docs drop out of `open-work.md`.
6. **Verify (serial).** Run the playbook's Verification gates: `docs:check-open-work`, `docs:check-initiative-followups`, `lint:initiative-status-sync`, `docs:check-links`, `docs:check-freshness-cadence`, plus every regenerated catalog's `--check`. Land the whole sweep as **one PR** (all surfaces are docs-sync; no feature work mixed in).
