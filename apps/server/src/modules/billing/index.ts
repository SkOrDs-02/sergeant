/**
 * Public barrel for the server billing module.
 *
 * Caller-и (`apps/server/src/routes/{ai-memory,billing,nutrition}.ts`)
 * імпортують лише звідси — не з `./{getUserPlan,requirePlan,stripe,plata}.js`.
 */
export { accessStateOf, getUserPlan, isFounderUser } from "./getUserPlan.js";
export type { AccessState, Plan, UserPlanResult } from "./getUserPlan.js";
export { requireFeature, requirePlan } from "./requirePlan.js";
export {
  createCheckoutSession,
  getSubscriptionStatus,
  processStripeWebhook,
  verifyStripeSignature,
  BillingConfigurationError,
  NoBillingCustomerError,
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
export { plataProvider, ensurePlataPubkey } from "./plata.js";
export { stripeProvider } from "./stripeProvider.js";
export { providerRegistry } from "./registry.js";
