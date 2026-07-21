# ADR-0050: TypeScript major-version policy + `@types/node` pinning

> **Last touched:** 2026-07-21 by @cursoragent. **Next review:** 2026-10-19.
> **Status:** Accepted

- **Status:** Accepted
- **Date:** 2026-05-06
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/90-work/initiatives/stack-pulse-2026-05/pr-05-typescript-types-node-downgrade.md`](../../90-work/initiatives/stack-pulse-2026-05/archive/pr-05-typescript-types-node-downgrade.md)
  - [`renovate.json`](../../../renovate.json) — `allowedVersions` rule for `@types/node`
  - [`package.json`](../../../package.json) — `pnpm.overrides["@types/node"]`

## Context and Problem Statement

Sergeant uses **TypeScript 6.x** across the monorepo (including `apps/mobile` on `~6.0.3`). Production runtime is **Node 22.x** (Volta `22.19.0`, `Dockerfile.api` → `node:22.16.0-alpine`). `@types/node` remains pinned to `^20.19.x` via `pnpm.overrides` until a dedicated bump to `@types/node@22` in the same PR as any further runtime pin change. Historical `tools/openclaw` / `tools/console` TS pin removed — directories deleted; OpenClaw stack fully decommissioned per [ADR-0075](./0075-openclaw-gateway-decommissioned.md).

Stack-pulse finding C5 identified this as a Critical risk.

## Decision

### 1. `@types/node` pinned to `^20.x` everywhere

All workspaces use `@types/node@^20.19.0`. Enforced by:

- `pnpm.overrides["@types/node"]: "^20"` in root `package.json` — prevents transitive hoisting of a newer version.
- `renovate.json` rule `allowedVersions: "<21"` — prevents Renovate from auto-bumping past major 20.
- Per-workspace explicit `devDependencies` entries set to `^20.19.0`.

If Node runtime is upgraded, bump `@types/node` to the matching major in the same PR that changes the Volta pin and CI `node-version`. **As of 2026-07-10:** runtime is already Node 22.x; `@types/node@20` is intentional interim until `@types/node@22` audit PR.

### 2. TypeScript 6.x at root — accepted, with fallback plan

TypeScript 6.0 is a first major release. We accept it for the benefits:

- Improved inference for discriminated unions.
- Better error messages.
- `--isolatedDeclarations` (used in `packages/shared`).

Known risk mitigations:

- `apps/mobile` runs TS 6.x alongside server/web/packages (Expo SDK 52; see ADR-0063 pre-flight).
- OpenClaw TypeScript surface — `packages/openclaw-plugin` (TS 6.x); legacy `tools/openclaw` removed.
- Any tooling (ESLint plugin, vitest) that is incompatible will get `resolutions`/`overrides` in the affected workspace until the ecosystem catches up.

### 3. Fallback plan to TS 5.9

If TS 6 causes unresolvable breakage in >3 packages simultaneously:

1. Pin root `typescript` to `^5.9.0` in root `package.json`.
2. Add `pnpm.overrides["typescript"]: "5.9"`.
3. Revert `--isolatedDeclarations` usages if any.
4. Open a follow-up ADR to document the rollback and the tooling blocker.

## Rationale

`@types/node@25` describing Node 25 APIs on a Node 20 runtime is a latent runtime crash vector with no compile-time warning. Pinning to `@types/node@20` eliminates the class of "compiled fine, crashed at runtime" bugs caused by using non-existent Node APIs through type-only imports. The pnpm override ensures that transitive dependencies that declare `@types/node` as a peer cannot hoist a newer version into the resolution graph.

## Consequences

- `pnpm typecheck` must pass with `@types/node@20` — any code using Node 22+ APIs that relied on the wrong types will now fail to compile (desired: surface the bug).
- Renovate will not auto-bump `@types/node` past major 20 until the Volta `node` version in `package.json` is updated.
- `tools/openclaw` TypeScript version — **N/A** (directory removed; see ADR-0055).
