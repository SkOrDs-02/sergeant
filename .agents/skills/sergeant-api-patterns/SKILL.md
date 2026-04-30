---
name: sergeant-api-patterns
description: "Sergeant API development patterns: bigint coercion, api-client type sync, RQ key factories, server response shapes. Use when writing or modifying API endpoints, serializers, React Query hooks, or api-client types."
---

# Sergeant API Patterns

Core conventions for API development across `apps/server`, `packages/api-client`, and `apps/web` query hooks.

## Bigint → Number Coercion (Hard Rule #1)

The `pg` driver returns `bigint` as string. Always coerce in the serializer — never let it leak to API consumers.

```ts
// ❌ BAD — bigint leaks as string; arithmetic breaks silently
return rows.map((r) => ({
  id: r.id,           // string!
  amount: r.amount,   // string!
}));

// ✅ GOOD — explicit Number() in the serializer
return rows.map((r) => ({
  id: Number(r.id),
  amount: Number(r.amount),
}));
```

Snapshot tests in `apps/server/src/modules/*` lock the shapes — if the snapshot diff shows a stringified number, you forgot the coercion.

## Three-Way Contract Sync (Hard Rule #3)

When changing a JSON response shape, three things move together in the same PR:

1. **Server serializer** (`apps/server/src/modules/<domain>/<handler>.ts`)
2. **API client types** (`packages/api-client/src/endpoints/<domain>.ts`)
3. **Contract test** (`apps/server/src/modules/<domain>/<handler>.test.ts`)

If you change only one — CI passes but consumers break.

## RQ Key Factories (Hard Rule #2)

All `useQuery`/`useMutation` keys come from centralized factories in `apps/web/src/shared/lib/queryKeys.ts`.

Available factories: `finykKeys`, `nutritionKeys`, `hubKeys`, `coachKeys`, `digestKeys`, `pushKeys`.

```ts
// ❌ BAD — drift; impossible to bulk-invalidate; typos compile
useQuery({ queryKey: ["finyk", "transactions", accountId], ... });

// ✅ GOOD — typed factory, supports bulk invalidate via finykKeys.all
import { finykKeys } from "@shared/lib/queryKeys";
useQuery({
  queryKey: finykKeys.monoTransactionsDb(from, to, accountId),
  ...
});
```

Secrets (Mono token, etc.) must be hashed via `hashToken()` before going into a key — they leak into devtools / logs otherwise.

## Money (UAH) — Domain Invariant

- **DB & API:** minor units (kopiykas) as `number` after bigint coercion.
- **UI:** divide by 100 at render time only. Use `fmtAmt(minor, currencyCode?)` from `@sergeant/finyk-domain/lib/formatting`.
- **Sign convention:** negative = expense, positive = income (Mono convention).

## Time — Domain Invariant

- **Timezone:** Always `Europe/Kyiv`. Day boundaries computed in Kyiv local time.
- **Storage:** `timestamptz` in Postgres (UTC at rest), read with `timezone('Europe/Kyiv', ts)` when bucketing by day.
- **Day key:** `YYYY-MM-DD` in Kyiv time. Week key: `YYYY-Www` (Monday start, ISO 8601).
- **Never** use `new Date().toISOString().slice(0,10)` — gives UTC day, breaks at 21:00–22:00 Kyiv time.

## Identity

User IDs are Better Auth opaque strings (e.g. `I3BUW5atld8oOHM7lpFEJBIInpW1hzv7`). Do not assume UUID format.

## Adding a New Endpoint

1. Create handler in `apps/server/src/modules/<domain>/`
2. Add typed client in `packages/api-client/src/endpoints/<domain>.ts`
3. Create RQ hook using the appropriate key factory
4. Add contract test with snapshot assertions
5. Coerce all bigint fields in the serializer

Playbook: `docs/playbooks/add-api-endpoint.md`

## Adding a React Query Hook

1. Use the centralized key factory (never inline keys)
2. Type the response from `@sergeant/api-client`
3. Place hook next to the component that uses it (co-location)
4. Use path aliases (`@shared/*`, `@finyk/*`, etc.) not relative imports

Playbook: `docs/playbooks/add-react-query-hook.md`
