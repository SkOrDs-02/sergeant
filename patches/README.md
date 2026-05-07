# patches/

> **Last reviewed:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Active

This directory contains pnpm-managed patches applied to upstream packages
via `pnpm patch <pkg>` → `pnpm patch-commit <path>`. Each row in the table
below is enforced by `scripts/check-patches-doc.mjs` (`pnpm lint:patches`),
which fails CI when a patch is missing a row, has empty mandatory cells,
or when `pnpm.patchedDependencies` in root `package.json` references a
patch file that does not exist on disk.

Closes [PR-20](../docs/initiatives/stack-pulse-2026-05/pr-20-patches-readme.md)
(stack-pulse-2026-05 / M4).

## Active patches

<!-- LINT:patches:table:start -->

| Patch                      | Reason                                                                                                                                                                                                                                                    | Upstream                                                                                                                                                                             | Drop when                                                                                                                                                                            | Owner        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `@expo__cli@0.22.28.patch` | tar v7 ships ESM with `__esModule=true` + no `default` export → `_tar().default.extract` is undefined and `expo prebuild` crashes. Patch wraps the `require("tar")` result so `.default` points back at the module namespace, restoring the v6 behaviour. | <https://github.com/chatwoot/chatwoot-mobile-app/pull/1045> (mirror context — root cause is upstream `tar` v7 + Babel `_interopRequireDefault` interaction in older Expo CLI builds) | Expo CLI ≥ 0.23.x lands the upstream-side fix (or downgrade to `tar` v6 transitively). PR-22 (Expo SDK 53 upgrade) will drop this patch automatically — verify after Expo SDK 53 GA. | `@Skords-01` |

<!-- LINT:patches:table:end -->

## Schema (enforced by `pnpm lint:patches`)

Every row inside the `LINT:patches:table` markers must have:

- **Patch** — exact filename matching `patches/*.patch` and a key in
  `pnpm.patchedDependencies` (root `package.json`).
- **Reason** — non-empty bug description.
- **Upstream** — link to upstream issue/PR/release-notes (or
  `n/a — internal patch` with a reason).
- **Drop when** — concrete condition (version, ADR, release date) under
  which the patch becomes obsolete.
- **Owner** — GitHub handle (e.g. `@Skords-01`) accountable for re-validating
  this patch on the next quarterly review.

The check runs in `pnpm lint` and as a dedicated `lint:patches` step in
`.github/workflows/ci.yml`.

## Adding or removing a patch

1. `pnpm patch <pkg>@<exact-version>` → modify in the temp dir → `pnpm
patch-commit <temp-path>`. pnpm writes the diff to `patches/` and
   updates `pnpm.patchedDependencies` for you.
2. Add / update / remove the corresponding row in this README between the
   `LINT:patches:table` markers.
3. Run `pnpm lint:patches` locally — it must pass before push.
4. Commit the patch file, the README change, and the
   `pnpm.patchedDependencies` update together.

## Why a freshness gate?

Patches are silent tech debt — nothing reminds the team that the upstream
fix has shipped. The gate forces a documented "Drop when" condition next
to every patch so the next contributor seeing a `pnpm install` patch
warning has a clear "is it safe to remove?" answer.
