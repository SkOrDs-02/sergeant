---
description: Run tests for a specific workspace. Usage: /test <workspace>
agent: sergeant-e2e-testing
---

Run `pnpm --filter @sergeant/$1 test` in the repo root.
If $1 is empty, run `pnpm check:typecheck-and-test`.
