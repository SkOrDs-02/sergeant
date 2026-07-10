/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Migrate deep imports (`../billing/usePlan`, `../billing/PaywallModal`,
 *           `../billing/TrialBanner`) in `HubMainContent`, `HubChat`,
 *           `FinykSection`, `PlanSection`, and `useChatSend` to this barrel
 *           (`@/core/billing`). Once consumers exist, drop this tag.
 *
 * Public entry point for the billing module — declared API surface kept for
 * cross-module consumers. See AGENTS.md → Hard Rule #10.
 */

export { usePlan } from "./usePlan";
export type { Plan, UsePlanResult } from "./usePlan";
export { PaywallModal } from "./PaywallModal";
export type {
  PaywallModalProps,
  PaywallSurface,
  PaywallVariant,
} from "./PaywallModal";
export { TrialBanner } from "./TrialBanner";
export type { TrialBannerProps } from "./TrialBanner";
export { TrialDay7Paywall } from "./TrialDay7Paywall";
export type { TrialDay7PaywallProps } from "./TrialDay7Paywall";
export { useFeatureGate } from "./useFeatureGate";
export type { PremiumFeatureId, UseFeatureGateResult } from "./useFeatureGate";
export {
  PAYWALL_TRIAL_DAY7_COPY_FLAG,
  resolvePaywallTrialDay7Copy,
  useTrialDay7Variant,
} from "./featureFlags";
export type { PaywallTrialDay7Variant } from "./featureFlags";
