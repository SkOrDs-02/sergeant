# Rule 3 — API contract: server response shape ↔ `api-client` types ↔ test

> **Category:** `blocker-invariant`
> **Severity:** `blocker`
> **Last validated:** 2026-05-09 by @Skords-01
> **Next review:** 2026-08-07
> **Status:** Active

> Per-rule canonical body for Hard Rule #3. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/server/src/modules/**`
- `packages/api-client/src/**`
- `apps/server/src/modules/**/*.test.ts`

## Enforced by

- **ci** — pnpm api:check-openapi (apps/server openapi vs packages/api-client)

## Why / What is enforced

When you change a JSON response shape in `apps/server/src/modules/*`, three things move together:

```diff
  // apps/server/src/modules/mono/read.ts (transactionsHandler)
  return rows.map((r) => ({
    id: Number(r.id),
+   merchantCategory: r.mcc ? String(r.mcc) : null,
    amount: Number(r.amount),
  }));
```

```diff
  // packages/api-client/src/endpoints/mono.ts
  export interface MonoTransaction {
    id: number;
+   merchantCategory: string | null;
    amount: number;
  }
```

```diff
  // apps/server/src/modules/mono/read.test.ts
  expect(result).toMatchInlineSnapshot(`
    {
      "id": 42,
+     "merchantCategory": "5411",
      "amount": 250,
    }
  `);
```

If you change only one — CI will pass but consumers break. Always do all three in the same PR.

## Related

- **agents** — #3
