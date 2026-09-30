/**
 * Status: Active
 *
 * Public entry point for the billing module — споживачі барелю живі
 * (`HubMainContent`, `HubReports`, `PlanSection`, `WeekPlanButton`, `PhotoStep`,
 * `useFinykVisionPaywall`). See AGENTS.md → Hard Rule #10.
 */

export { usePlan } from "./usePlan";
export type { Plan, UsePlanResult } from "./usePlan";
export { PaywallModal } from "./PaywallModal";
export type { PaywallModalProps, PaywallSurface } from "./PaywallModal";
export { TrialBanner } from "./TrialBanner";
export type { TrialBannerProps } from "./TrialBanner";
export { useFeatureGate } from "./useFeatureGate";
export type {
  PaywalledFeatureId,
  UseFeatureGateResult,
} from "./useFeatureGate";
export { isQuotaError } from "./quotaError";
