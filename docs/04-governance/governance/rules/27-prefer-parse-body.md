# Rule 27 — Prefer `parseBody` / `parseQuery` over sentinel `validateBody` / `validateQuery`

> **Category:** `lint-enforced-convention`
> **Severity:** `warn` (rollout → `error` after migration complete)
> **Last touched:** 2026-07-10 by @claude. **Next review:** 2026-10-08.
> **Status:** Active

> ESLint convention enforced by `sergeant-design/prefer-parse-body-over-validate-body` in `packages/eslint-plugin-sergeant-design`. Not a numbered Hard Rule in `hard-rules.json` — this file is the canonical doc body referenced from the plugin and server handler comments.

## Scope

- `apps/server/src/**` (Express route handlers)
- Excludes `apps/server/src/http/validate.ts` (definition site) and `*.test.*` files

## Enforced by

- **eslint** — `sergeant-design/prefer-parse-body-over-validate-body` (`warn` today)
- **convention** — throw-based `parseBody` / `parseQuery` with `asyncHandler` + centralized `errorHandler`

## Why / What is enforced

Legacy `validateBody(Schema, req, res)` / `validateQuery(Schema, req, res)` return a sentinel `{ ok: false }` and require a manual `if (!parsed.ok) return`. A forgotten `return` after a failed validation caused double-response 500s in production.

Throw-based `parseBody` / `parseQuery` integrate with `asyncHandler` and the global `errorHandler`, which maps validation failures to HTTP 400 with `code: "VALIDATION"` automatically.

### BAD

```ts
const parsed = validateBody(MySchema, req, res);
if (!parsed.ok) return;
const body = parsed.data;
```

### GOOD

```ts
const body = parseBody(MySchema, req);
```

## Related

- **initiative** — `docs/90-work/planning/archive/pr-plan-backend-perf-2026-05.md` (PR-09, PR-10, PR-11)
- **eslint** — `packages/eslint-plugin-sergeant-design/index.js` (`prefer-parse-body-over-validate-body`)
