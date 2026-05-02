/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Have App router import `NutritionApp` from `@nutrition` instead of
 *           `@modules/nutrition/NutritionApp`. See AGENTS.md → Hard Rule #10.
 *
 * Public entry point for the Nutrition module — declared API surface.
 *
 * Prefer importing from `@nutrition` instead of deep paths for cross-module
 * consumers (e.g. App router, hub registry):
 *
 *   import { NutritionApp } from "@nutrition";
 *
 * Deep imports remain recommended for intra-module use.
 */

export { default as NutritionApp } from "./NutritionApp";
