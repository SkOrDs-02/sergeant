/**
 * Sergeant Design System — AI Insight surfaces public API.
 *
 * Import from `@shared/lib/insights` to keep deep paths stable and the
 * public surface focused. Introduced у PR-7a (2026-05 v2 redesign).
 */

export type {
  Insight,
  InsightAction,
  InsightId,
  InsightShowOn,
} from "./types";

export {
  useInsightDismissal,
  type UseInsightDismissalResult,
} from "./useInsightDismissal";
