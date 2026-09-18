/**
 * Public surface of the Habit Heatmap aggregation module.
 *
 * Re-exported from `@sergeant/routine-domain` so both `apps/web` and
 * `apps/mobile` import heatmap helpers via the same entry point as
 * other routine-domain surfaces (dateKeys, streaks, schedule, …).
 */

export * from "./types.js";
export * from "./grid.js";
