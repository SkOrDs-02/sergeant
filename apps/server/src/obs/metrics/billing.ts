import client from "prom-client";

import { register } from "./registry.js";

// ───────────────────────── Billing (Phase 7 UA) ─────────────────────────
// Метрики українського еквайрингу (LiqPay + Plata). Провайдер-лейбл спільний
// для всіх трьох — щоб у Grafana порівнювати воронки LiqPay vs Plata vs
// Stripe (dormant). Сум/PII у лейблах нема (Hard Rule #21).

/**
 * Спроби checkout-у. `provider` = stripe|liqpay|plata; `result` =
 * ok | error | unavailable (503 BILLING_UNAVAILABLE / 400 PROVIDER_UNAVAILABLE) |
 * blocked (409 ALREADY_SUBSCRIBED / CHECKOUT_PENDING).
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
 * Plata — провайдер-керовані (`subscription/*`), інкрементується зі звірки
 * `plataSync.ts` (`subscription/status` — арбітр стану). `result` =
 * charged | past_due | error.
 */
export const billingRecurringChargeTotal = new client.Counter({
  name: "billing_recurring_charge_total",
  help: "Recurring subscription charges by provider and result",
  labelNames: ["provider", "result"],
  registers: [register],
});

/**
 * Скасування ЗАМІНЕНОЇ рекурентки у її провайдера (`supersede.ts`). `result` =
 * cancelled (провайдер підтвердив) | gone (підписки в провайдера вже нема) |
 * failed (відмова, рядок лишається в черзі на ретрай) | abandoned (вичерпано
 * ліміт спроб, потрібен ручний розбір: стара підписка може й далі списувати).
 */
export const billingSupersedeCancelTotal = new client.Counter({
  name: "billing_supersede_cancel_total",
  help: "Cancellations of superseded recurring subscriptions by provider and result",
  labelNames: ["provider", "result"],
  registers: [register],
});

/**
 * Unix-час (с) останнього успішного тіку звірки Plata (`plataSync.ts`).
 * `tick` = fast (5 хв, непідтверджені checkout-и) | slow (щогодини, «кому
 * вже час»). Алерт `PlataSyncSlowTickStale` дивиться на `tick="slow"`: це
 * єдиний шлях, що продовжує період і ставить `past_due`, коли вебхук
 * загубився (rel-19).
 *
 * На `start()` поллера gauge засіюється часом старту: без цього після
 * рестарту серії не було б зовсім, доки перший тік не вдасться, і поллер,
 * що падає з першого ж тіку, не алертив би ніколи. Тож значення читається
 * як «max(старт поллера, останній успіх)», а справжній `lastRunAt` (null до
 * першого успіху) віддає `/health/workers`.
 */
export const plataSyncLastSuccessTimestampSeconds = new client.Gauge({
  name: "plata_sync_last_success_timestamp_seconds",
  help: "Unix time of last successful Plata reconciliation tick (seeded with poller start)",
  labelNames: ["tick"], // fast|slow
  registers: [register],
});
