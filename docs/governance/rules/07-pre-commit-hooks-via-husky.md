# Rule 7 — Pre-commit hooks via Husky — do not skip

> **Category:** `blocker-invariant`
> **Severity:** `blocker`
> **Last validated:** 2026-05-13 by @Skords-01
> **Next review:** 2026-08-11
> **Status:** Active

> Per-rule canonical body for Hard Rule #7. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `**/*`

## Enforced by

- **hook** — .husky/pre-commit (lint-staged)

## Why / What is enforced

`--no-verify` is forbidden. If a hook is broken, fix the hook in the same PR; do not bypass it.

## Related

- **agents** — #7
