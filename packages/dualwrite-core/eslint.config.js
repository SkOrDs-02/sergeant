// PR-31 phase 2b — standalone per-package ESLint flat-config.
//
// Re-exports the repo-root manifest unchanged (via `packageConfig`), wrapped
// in a `basePath` that re-anchors the root blocks' repo-relative globs to the
// repo root. ESLint flat-config discovery stops at this file when linting
// from the package cwd (`turbo run lint`), so it must be self-sufficient —
// `eslint --print-config` here is byte-identical to the root config resolved
// from the repo root (guarded by `pnpm lint:eslint-config-diff`). Edit rules
// in `eslint.baseline.js` / `eslint.<surface>.js` at the root, never here.
import { packageConfig } from "../../eslint.per-package.js";

export default packageConfig("../..");
