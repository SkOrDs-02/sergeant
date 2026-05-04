---
name: sergeant-review-and-merge
description: Use when reviewing a Sergeant PR, preparing changes for merge, checking commit scope, validating docs freshness, or deciding whether a change is safe to ship.
---

# Sergeant Review and Merge

Review for production safety first, polish second. A Sergeant review is not complete until repo governance risks are checked alongside code quality.

## Review Checklist

- Correct surface skill was followed for the changed area
- Tests cover the changed behavior, not just implementation details
- API shape changes moved with `api-client` and tests
- Migration safety is explicit if SQL changed
- Docs are updated only when canonical docs actually changed
- Commit scope matches `AGENTS.md`
- No `--no-verify`, no skipped hooks, no unsafe deploy sequencing

## Merge Readiness Triggers

Pay extra attention when the diff touches:

- `apps/server/src/migrations/**`
- `apps/server/src/modules/**` with `packages/api-client/**`
- `apps/web/src/shared/lib/api/queryKeys.ts`
- `apps/web/src/core/lib/hubChat*`
- auth wiring, env docs, or deploy docs
- `.agents/**`, `docs/superpowers/**`, `.github/**`

## Findings Priority

- Breakage or data loss risk
- Contract drift or missing test coverage
- Deploy or rollback hazard
- Docs, maintainability, or clarity gaps

## Playbooks

- `docs/playbooks/release-web-and-api.md` — coordinated web + server release.
- `docs/playbooks/release-mobile-shell.md` — mobile-shell coordinated release.
- `docs/playbooks/declare-incident.md` — escalation when a merge regresses prod.
- Catalog: `docs/superpowers/agent-skills-catalog.md`.
