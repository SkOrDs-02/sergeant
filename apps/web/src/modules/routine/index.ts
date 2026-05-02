/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Have App router import `RoutineApp` from `@routine` instead of
 *           `@modules/routine/RoutineApp`. See AGENTS.md → Hard Rule #10.
 *
 * Public entry point for the Routine module — declared API surface.
 *
 * Prefer importing from `@routine` instead of deep paths for cross-module
 * consumers (e.g. App router, hub registry):
 *
 *   import { RoutineApp, type RoutineAppProps } from "@routine";
 *
 * Deep imports remain recommended for intra-module use.
 */

export { default as RoutineApp } from "./RoutineApp";
export type { RoutineAppProps } from "./RoutineApp";
