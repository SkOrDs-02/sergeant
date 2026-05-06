# ADR-0050: TypeScript major-version policy + `@types/node` pinning

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-11-06.
> **Status:** Accepted

- **Status:** Accepted
- **Date:** 2026-05-06
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/initiatives/stack-pulse-2026-05/pr-05-typescript-types-node-downgrade.md`](../initiatives/stack-pulse-2026-05/pr-05-typescript-types-node-downgrade.md)
  - [`renovate.json`](../../renovate.json) — `allowedVersions` rule for `@types/node`
  - [`package.json`](../../package.json) — `pnpm.overrides["@types/node"]`

## Context and Problem Statement

Sergeant uses **TypeScript 6.x** at the root and in `apps/server`, `apps/web`, and `packages/*`, but **TypeScript 5.9.x** in `apps/mobile` (Expo SDK 52 constraint) and **TypeScript 5.7.x** in `tools/console`. Additionally, `@types/node` was at `^25.6.0` across all workspaces while the production runtime is **Node 20.20.2** (pinned via Volta). Node 25 types describe APIs that do not exist on the runtime: `node:sqlite`, `fs.glob`, `import.meta.dirname`, new stream overloads. These could silently compile but crash at runtime.

Stack-pulse finding C5 identified this as a Critical risk.

## Decision

### 1. `@types/node` pinned to `^20.x` everywhere

All workspaces use `@types/node@^20.19.0`. Enforced by:

- `pnpm.overrides["@types/node"]: "^20"` in root `package.json` — prevents transitive hoisting of a newer version.
- `renovate.json` rule `allowedVersions: "<21"` — prevents Renovate from auto-bumping past major 20.
- Per-workspace explicit `devDependencies` entries set to `^20.19.0`.

If Node runtime is upgraded (e.g., to Node 22 LTS), bump `@types/node` to the matching major in the same PR that changes the Volta pin and CI `node-version`.

### 2. TypeScript 6.x at root — accepted, with fallback plan

TypeScript 6.0 is a first major release. We accept it for the benefits:

- Improved inference for discriminated unions.
- Better error messages.
- `--isolatedDeclarations` (used in `packages/shared`).

Known risk mitigations:

- `apps/mobile` is pinned to TS 5.9 (Expo SDK hard constraint) — separate tsconfig, no shared compilation target.
- `tools/console` will be bumped to TS 6.x in a follow-up PR once `@anthropic-ai/sdk` ships TS 6 compat types.
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
- `tools/console` TypeScript version remains at 5.7 until a dedicated PR bumps it alongside an `@anthropic-ai/sdk` TS 6 compat update.
