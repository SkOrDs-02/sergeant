# Rule 6 — No force push to main/master

> **Category:** `blocker-invariant`
> **Severity:** `blocker`
> **Last touched:** 2026-09-11 by @claude. **Next review:** 2027-04-16.
> **Status:** Active

> Per-rule canonical body for Hard Rule #6. Compact summary lives in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `main`
- `master`

## Enforced by

- **branch-protection** — GitHub branch protection: 'Allow force pushes' = off on main

## Why / What is enforced

`--force-with-lease` on feature branches is OK.

## Related

- **agents** — #6
