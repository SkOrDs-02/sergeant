// PR-31 phase 2b — per-package standalone config helper.
//
// Each linted workspace (`apps/<x>`, `packages/<x>`) ships its own
// `eslint.config.js` so `turbo run lint` resolves a config from the
// package cwd instead of walking up to the repo-root manifest. ESLint's
// flat-config discovery stops at the closest `eslint.config.js`, so once a
// package has its own file the root config no longer applies to it — the
// per-package file must therefore be self-sufficient.
//
// Rather than re-deriving each surface's slice (which would fork the rule
// set and invite drift), every per-package config re-exports the *same*
// composed root array. The root blocks carry repo-root-relative globs
// (`apps/web/src/**`, `packages/shared/src/**`, …); to keep those globs
// resolving against the repo root even though the config now lives in a
// subdirectory, we wrap the whole array in a single `basePath` that points
// back up to the root. `eslint --print-config` then yields byte-identical
// output to running the root config from the repo root — verified per
// surface by `pnpm lint:eslint-config-diff` (cd-per-package mode).
//
// Blocks scoped to other surfaces (e.g. `apps/server/**` inside the web
// package's config) simply never match any file under the package cwd, so
// they are inert — the resolved config for any given file is identical to
// what the root manifest produces.
import { defineConfig } from "eslint/config";
import rootConfig from "./eslint.config.js";

/**
 * Build a package-local flat config equivalent to the root manifest.
 *
 * @param {string} basePath - POSIX-relative path from the package directory
 *   back to the repo root (e.g. `"../.."` for `apps/web` / `packages/shared`).
 *   Used as the flat-config `basePath` so the root blocks' repo-relative
 *   `files`/`ignores` globs resolve against the repo root.
 * @returns the wrapped flat-config array.
 */
export function packageConfig(basePath) {
  return defineConfig([{ basePath, extends: rootConfig }]);
}
