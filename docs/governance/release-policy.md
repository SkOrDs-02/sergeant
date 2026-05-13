# Release Policy

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Active

Canonical release policy for Sergeant. This document defines when a normal merge is enough and when a change must be treated as an explicit release event with extra coordination.

## Release classes

| Release class       | Typical changes                                                                                                                       | Required mindset                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Merge-only          | docs-only, tests-only, internal refactors with no runtime or user-facing change                                                       | Standard PR and CI coverage                                                       |
| Coordinated release | web-only UI behavior, server-only runtime behavior, mobile build, console agent prompt/tool changes                                   | Use the matching release playbook and record post-release verification            |
| High-risk release   | schema changes, auth/session changes, env changes, external integration changes, multi-surface deploys, rollback-sensitive migrations | Treat the PR as release-bearing and follow explicit rollback + verification steps |

## A release PR mindset is required when

- Production behavior changes for any user-facing surface.
- A deploy requires ordered steps across web, API, database, env, or mobile channels.
- The rollback path is not "revert and redeploy".
- Error budget is already degraded for the touched service.
- An open incident or active alert touches the same surface.
- The change introduces, graduates, or removes a feature flag that acts as a kill switch.

## Release blockers

Do not continue a release until one of these is resolved or explicitly waived:

- CI is red on checks that exercise the changed surface.
- Error budget is in red for the affected service unless the release is the mitigative fix.
- There is an unresolved SEV1 or SEV2 incident on the same dependency chain.
- A pending migration or env change has no documented ordering.
- The service catalog, playbook, or rollback notes are stale for the touched surface.

## Required release loop

1. Identify the primary surface in [service-catalog.md](../architecture/service-catalog.md).
2. Open exactly one primary release playbook.
3. Confirm release order, rollback path, and post-release verification before merge.
4. Merge and deploy only after the required checks are green.
5. Run the post-release verification steps from the playbook.
6. Record release notes in the PR description or release issue.
7. If the release exposed a new failure mode, update the runbook or postmortem index.

## Release notes minimum

Every coordinated or high-risk release should record:

- affected surface
- deploy target
- user-visible change
- flag or kill-switch status
- migration/env ordering if any
- verification run after deploy
- rollback plan or prior version reference

## Canonical playbooks

- [release.md](../playbooks/release.md) — canonical merged playbook (web + API, Capacitor shell, Expo) with decision tree.
- [hotfix-prod-regression.md](../playbooks/hotfix-prod-regression.md)
