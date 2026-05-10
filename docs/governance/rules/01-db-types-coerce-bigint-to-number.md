# Rule 1 — DB types: coerce `bigint` to `number` in serializers

> **Category:** `blocker-invariant`
> **Severity:** `blocker`
> **Last validated:** 2026-05-09 by @Skords-01
> **Next review:** 2026-08-07
> **Status:** Active

> Per-rule canonical body for Hard Rule #1. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/server/src/modules/**`

## Enforced by

- **test** — apps/server/src/modules/\*_/_.test.ts (snapshot tests lock the response shapes)

## Why / What is enforced

The `pg` driver returns `bigint` as **string** (see [#708](https://github.com/Skords-01/Sergeant/issues/708)). Always coerce in the serializer, never let it leak to API consumers.

```ts
// ❌ BAD — bigint leaks as string to client; arithmetic breaks silently
return rows.map((r) => ({
  id: r.id, // string!
  amount: r.amount, // string!
}));

// ✅ GOOD — explicit Number() in the serializer
return rows.map((r) => ({
  id: Number(r.id),
  amount: Number(r.amount),
}));
```

Snapshot tests in `apps/server/src/modules/*` lock the shapes — if the snapshot diff shows a stringified number, you forgot the coercion.

## Related

- **issue** — #708
- **agents** — #1
