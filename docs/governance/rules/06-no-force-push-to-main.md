# Rule 6 — No force push to main/master

> **Category:** `blocker-invariant`
> **Severity:** `blocker`
> **Last validated:** 2026-05-13 by @Skords-01
> **Next review:** 2026-08-11
> **Status:** Active

> Per-rule canonical body for Hard Rule #6. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `main`
- `master`

## Enforced by

- **branch-protection** — GitHub branch protection: 'Allow force pushes' = off on main

## Why / What is enforced

`--force-with-lease` on feature branches is OK.

## Related

- **agents** — #6
