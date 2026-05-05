/**
 * Type declarations for the JS-authored Vitest base config.
 *
 * Mirror of `vitest.base.js` (kept in JS so Node's ESM loader can resolve
 * it through the package export without a transpiler — see the AI-NOTE
 * in `vitest.base.js`). Added to satisfy the staged-typecheck pre-commit
 * hook (`scripts/staged-typecheck.mjs`), which runs `tsc-files --noEmit`
 * against any modified `vitest.config.ts` under the nearest `tsconfig.json`
 * and would otherwise fail on `allowJs: false`.
 */

import type { UserConfig } from "vitest/config";

type CoverageOptions = NonNullable<NonNullable<UserConfig["test"]>["coverage"]>;

export const baseVitestConfig: UserConfig;

export const baseCoverageConfig: CoverageOptions;
