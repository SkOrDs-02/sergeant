/**
 * Provider registry — `Record<ProviderId, BillingProvider>` (Phase 7 UA
 * billing). Route-layer робить `providerRegistry[resolveProvider(...)]`
 * замість прямого виклику Stripe. Stripe лишається у реєстрі (dormant), щоб
 * cancel/status працювали для наявних Stripe-підписок.
 */
import type { BillingProvider, ProviderId } from "./provider.js";
import { liqpayProvider } from "./liqpay.js";
import { plataProvider } from "./plata.js";
import { stripeProvider } from "./stripeProvider.js";

export const providerRegistry: Record<ProviderId, BillingProvider> = {
  stripe: stripeProvider,
  liqpay: liqpayProvider,
  plata: plataProvider,
};
