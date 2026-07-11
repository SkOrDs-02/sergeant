import client from "prom-client";

import { register } from "./registry.js";

// ───────────────────────── Billing (Phase 7 UA) ─────────────────────────
// Метрики українського еквайрингу (LiqPay + Plata). Провайдер-лейбл спільний
// для всіх трьох — щоб у Grafana порівнювати воронки LiqPay vs Plata vs
// Stripe (dormant). Сум/PII у лейблах нема (Hard Rule #21).

/**
 * Спроби checkout-у. `provider` = stripe|liqpay|plata; `result` =
 * ok | error | unavailable (503 BILLING_UNAVAILABLE / 400 PROVIDER_UNAVAILABLE).
 */
export const billingCheckoutTotal = new client.Counter({
  name: "billing_checkout_total",
  help: "Billing checkout attempts by provider and result",
  labelNames: ["provider", "result"],
  registers: [register],
});

/**
 * Вхідні webhook-и/callback-и. `provider` = stripe|liqpay|plata; `status` =
 * verified (підпис ок, оброблено) | bad_sig (відхилено) | dup (dedup-skip).
 */
export const billingWebhookTotal = new client.Counter({
  name: "billing_webhook_total",
  help: "Billing webhook deliveries by provider and verification status",
  labelNames: ["provider", "status"],
  registers: [register],
});

/**
 * Рекурентні списання. LiqPay — провайдер-керовані (callback `action:regular`);
 * Plata — наш scheduler. `result` = charged | past_due | error.
 */
export const billingRecurringChargeTotal = new client.Counter({
  name: "billing_recurring_charge_total",
  help: "Recurring subscription charges by provider and result",
  labelNames: ["provider", "result"],
  registers: [register],
});
