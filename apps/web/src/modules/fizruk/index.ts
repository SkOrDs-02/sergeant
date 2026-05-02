/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Have App router import `FizrukApp` from `@fizruk` instead of
 *           `@modules/fizruk/FizrukApp`. See AGENTS.md → Hard Rule #10.
 *
 * Public entry point for the Fizruk module — declared API surface.
 *
 * Prefer importing from `@fizruk` instead of deep paths for cross-module
 * consumers (e.g. App router, hub registry):
 *
 *   import { FizrukApp } from "@fizruk";
 *
 * Deep imports remain recommended for intra-module use.
 */

export { default as FizrukApp } from "./FizrukApp";
