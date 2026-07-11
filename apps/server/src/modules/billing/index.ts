/**
 * Public barrel for the server billing module.
 *
 * @scaffolded
 * @nextStep Migrate `apps/server/src/routes/{ai-memory,billing}.ts` and
 *   future routes from `../modules/billing/{getUserPlan,requirePlan,stripe}.js`
 *   deep-import to barrel `../modules/billing`. Tracked in dead-code roast
 *   2026-05-13.
 */
export { getUserPlan } from "./getUserPlan.js";
export type { Plan, UserPlanResult } from "./getUserPlan.js";
export { requirePlan } from "./requirePlan.js";
export { effectiveLimits } from "./effectiveLimits.js";
export type { EffectiveLimits } from "./effectiveLimits.js";
export {
  createCheckoutSession,
  getSubscriptionStatus,
  processStripeWebhook,
  verifyStripeSignature,
  BillingConfigurationError,
} from "./stripe.js";
// Multi-provider billing (Phase 7 UA billing — LiqPay + Plata live).
export {
  getEnabledProviders,
  resolveProvider,
  ProviderNotAvailableError,
} from "./provider.js";
export type {
  BillingProvider,
  ProviderId,
  ProviderCheckoutInput,
  ProviderPortalInput,
  ProviderSessionUser,
  EnabledProvidersOptions,
} from "./provider.js";
export { liqpayProvider } from "./liqpay.js";
export { plataProvider } from "./plata.js";
export { stripeProvider } from "./stripeProvider.js";
export { providerRegistry } from "./registry.js";
