/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Have the App router (`apps/web/src/core/app/appRouter.tsx`) and
 *           hub registry import `FinykApp` from `@finyk` (this barrel) instead
 *           of `@modules/finyk/FinykApp`. Once consumers exist, drop this tag.
 *
 * Public entry point for the Finyk module — declared API surface kept for
 * cross-module consumers. See AGENTS.md → Hard Rule #10.
 *
 * Prefer importing from `@finyk` or `@modules/finyk` instead of deep paths
 * for cross-module consumers (e.g. App router, hub registry):
 *
 *   import { FinykApp } from "@finyk";
 *
 * Deep imports (`@finyk/utils`, `@finyk/constants`) are still recommended
 * for intra-module use and tree-shaking-sensitive call sites.
 */

export { default as FinykApp } from "./FinykApp";
