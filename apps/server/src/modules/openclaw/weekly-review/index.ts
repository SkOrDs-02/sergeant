/**
 * O3 (Phase 2.B) — public surface OpenClaw weekly review template + builder.
 * HTTP route `/api/internal/openclaw/ritual/weekly` і консумери, що
 * рендерять weekly review, імпортують звідси.
 */

export { buildWeeklyReview } from "./template.js";
export { assembleWeeklyReview } from "./builder.js";
export type { AssembleWeeklyReviewOptions } from "./builder.js";
export type {
  AssembleWeeklyReviewInput,
  WeeklyAlertsSection,
  WeeklyMetricsSection,
  WeeklyNarrativeSection,
  WeeklyOpenCommitmentsSection,
  WeeklyReviewData,
  WeeklyReviewResponse,
  WeeklyShippedSection,
} from "./types.js";
