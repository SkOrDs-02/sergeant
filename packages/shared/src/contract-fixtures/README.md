# Contract fixtures

Single source of truth for canonical API request / response shapes,
shared between `apps/server` (producer), `packages/api-client`
(consumer), and `apps/web` / `apps/mobile` (UI).

## Why

The diagnostic in
[`docs/audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md`](../../../../docs/audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md)
§7.4 calls out that we have unit tests on each side of the wire but
**no** test that locks the wire format itself. With the same `Zod`
schema imported on both sides, drift is theoretically impossible — but
practically, Hard Rule #3 in `AGENTS.md` ("API contract: server
response shape ↔ `api-client` types ↔ test") still relies on humans
remembering to update three files in the same PR.

A contract fixture flips that around:

- **One fixture**, checked in, hand-curated to be canonical.
- The server's tests run it through the response builder + schema
  parser → the fixture is a "golden" shape the producer must emit.
- The api-client's tests feed the same fixture into a mocked `fetch`
  → the consumer must accept it byte-for-byte.
- A fixture that no longer parses through the schema = the schema
  changed without the fixture being updated. CI fails on **either**
  side, immediately.

## Layout

```
contract-fixtures/
├── README.md           ← this file
├── index.ts            ← barrel
└── me.ts               ← /api/me canonical shapes (User, MeResponse)
```

Each module exports:

- `<endpoint>Fixtures` — a non-empty `Record<string, T>` of named cases
  (`minimal`, `full`, `legacyNoCreatedAt`, …).
- `<endpoint>RawFixtures` — the same cases as `unknown`, suitable for
  feeding into a parser to verify it accepts the wire JSON. Useful when
  you want to test the schema's `.parse()` path explicitly.

## Adding a fixture

1. Add a new case to the matching module (or create a new one keyed by
   the route path: `me.ts`, `nutritionAnalyze.ts`, …).
2. Export it through `index.ts`.
3. Add an assertion in the corresponding contract test
   (`apps/web/src/test/contract/<name>.contract.test.ts`) that the
   api-client accepts the fixture, AND in the server-side test that
   the route emits the fixture given matching inputs.
4. CI now blocks any future schema drift that breaks either side.
