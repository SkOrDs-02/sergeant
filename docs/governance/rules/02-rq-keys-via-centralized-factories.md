# Rule 2 — RQ keys: only via centralized factories

> **Category:** `blocker-invariant`
> **Severity:** `blocker`
> **Last validated:** 2026-05-13 by @Skords-01
> **Next review:** 2026-08-11
> **Status:** Active

> Per-rule canonical body for Hard Rule #2. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/web/src/**`
- `apps/mobile/src/**`

## Enforced by

- **convention** — apps/web/src/shared/lib/api/queryKeys.ts (single source of truth)

## Why / What is enforced

All `useQuery`/`useMutation` keys come from `apps/web/src/shared/lib/api/queryKeys.ts`. Factories: `finykKeys`, `nutritionKeys`, `hubKeys`, `coachKeys`, `digestKeys`, `pushKeys`.

```ts
// ❌ BAD — drift; impossible to bulk-invalidate; typos compile
useQuery({ queryKey: ["finyk", "transactions", accountId], ... });

// ✅ GOOD — typed factory, supports bulk invalidate via `finykKeys.all`
import { finykKeys } from "@shared/lib/api/queryKeys";
useQuery({
  queryKey: finykKeys.monoTransactionsDb(from, to, accountId),
  ...
});
```

Secrets (Mono token, etc.) **must** be hashed via `hashToken()` before going into a key — they leak into devtools / logs otherwise.

## Related

- **agents** — #2
