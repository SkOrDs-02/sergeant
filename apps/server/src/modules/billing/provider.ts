/**
 * Multi-provider billing abstraction (0010 PR-8 scaffold).
 *
 * Sergeant продає Pro через Stripe (canonical, live). LiqPay додається як
 * другий provider для українського ринку — UA-картки мають вищий
 * 3DS-failure rate на Stripe (ADR-0001 §ADR-1.1), тому частина платежів
 * зривається. Live LiqPay-інтеграція — Phase 7; цей модуль лише фіксує
 * контракт (`BillingProvider`) і resolver (`getProviderForCountry`), щоб
 * live-код вбудувався без рефакторингу білінгу.
 *
 * Stripe-модуль (`./stripe.ts`) ще НЕ реалізує цей інтерфейс напряму —
 * адаптація існуючих функцій під `BillingProvider` — окремий крок live-фази.
 * Тут ми лише декларуємо shape, який обидва provider-и зобовʼязані віддати.
 */
import type { Pool } from "pg";
import type {
  BillingCheckoutResponse,
  BillingPlan,
  BillingPortalResponse,
  BillingStatusResponse,
} from "@sergeant/shared";
import { env } from "../../env/env.js";

/**
 * Канонічний набір payment-provider-ів. Узгоджено з CHECK-constraint
 * `subscriptions_provider_check` (migration 075) — мінус `manual`, який
 * не має checkout-flow (seeded/admin-granted), і мінус `apple`/`google`,
 * що йдуть через native IAP, а не через цей web-billing resolver.
 */
export type ProviderId = "stripe" | "liqpay";

export interface ProviderSessionUser {
  id: string;
  email?: string | null;
}

export interface ProviderCheckoutInput {
  pool: Pool;
  user: ProviderSessionUser;
  plan: BillingPlan;
}

export interface ProviderPortalInput {
  pool: Pool;
  user: ProviderSessionUser;
}

/**
 * Контракт, який кожен web payment-provider зобовʼязаний реалізувати.
 * Дзеркалить публічну поверхню `./stripe.ts` (checkout, portal, status,
 * webhook verify + process) у provider-agnostic shape.
 */
export interface BillingProvider {
  readonly id: ProviderId;
  /** Створює checkout-session і повертає redirect-URL. */
  createCheckoutSession(
    input: ProviderCheckoutInput,
  ): Promise<BillingCheckoutResponse>;
  /** Створює self-serve customer-portal session (manage / cancel). */
  createCustomerPortalSession(
    input: ProviderPortalInput,
  ): Promise<BillingPortalResponse>;
  /** Читає поточний subscription-стан користувача. */
  getSubscriptionStatus(
    pool: Pool,
    userId: string,
  ): Promise<BillingStatusResponse>;
  /** Верифікує підпис вхідного webhook-запиту (provider-specific). */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  /** Обробляє верифікований webhook → upsert у `subscriptions`. */
  processWebhook(pool: Pool, rawBody: string): Promise<void>;
}

export interface ResolveProviderOptions {
  /** ISO-3166 alpha-2 країна користувача (наприклад `"UA"`, `"US"`). */
  country?: string | null;
  /**
   * Чи увімкнено LiqPay. Default — `env.LIQPAY_ENABLED` (feature-flag,
   * off до Phase 7). Явний override існує для тестів і для майбутнього
   * PostHog-flag rollout-у.
   */
  liqpayEnabled?: boolean;
}

/**
 * Обирає payment-provider за країною користувача.
 *
 * Правило: UA + LiqPay-enabled → `liqpay`; усі інші випадки → `stripe`
 * (canonical default). Поки `LIQPAY_ENABLED=false` (до Phase 7) resolver
 * завжди повертає `stripe`, тож scaffold безпечно живе у проді не
 * змінюючи поведінку.
 */
export function getProviderForCountry({
  country,
  liqpayEnabled = env.LIQPAY_ENABLED,
}: ResolveProviderOptions = {}): ProviderId {
  if (liqpayEnabled && country?.toUpperCase() === "UA") {
    return "liqpay";
  }
  return "stripe";
}
