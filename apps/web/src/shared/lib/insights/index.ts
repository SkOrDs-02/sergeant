/**
 * @scaffolded
 * @status Scaffolded
 * @owner @Skords-01
 * @nextStep Wire the insight surfaces into a live consumer (Hub digest /
 *           InsightCard registry) in PR-8 and delete this tag. See
 *           AGENTS.md → Hard Rule #10.
 *
 * Scaffolded barrel — knip reports zero importers until PR-8 wires the
 * insight surfaces into a live consumer. Do NOT delete as part of
 * dead-code cleanup — see Hard Rule #10 in AGENTS.md.
 *
 * Sergeant Design System — AI Insight surfaces public API.
 *
 * Import from `@shared/lib/insights` to keep deep paths stable and the
 * public surface focused. Introduced у PR-7a (2026-05 v2 redesign).
 */

export type { Insight, InsightAction, InsightId, InsightShowOn } from "./types";

export {
  useInsightDismissal,
  type UseInsightDismissalResult,
} from "./useInsightDismissal";

export { useAllInsights, type UseAllInsightsOptions } from "./useAllInsights";
