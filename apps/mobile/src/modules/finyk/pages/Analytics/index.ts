/**
 * Public barrel for the Finyk Analytics screen (mobile).
 * Consumers (`app/(tabs)/finyk/analytics.tsx`, tests) import from
 * this module path so the internal file structure stays private.
 */
export { Analytics } from "./Analytics";
export type { AnalyticsProps } from "./Analytics";
export type { FinykAnalyticsData } from "./types";
export { useFinykAnalyticsData } from "./useFinykAnalyticsData";
