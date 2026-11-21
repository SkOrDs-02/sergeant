/**
 * Multi-provider billing abstraction (0010 PR-8 scaffold).
 *
 * Sergeant продає Pro через Stripe (canonical, live). LiqPay додається як
 * другий provider для українського ринку — UA-картки мають вищий
 * 3DS-failure rate на Stripe (ADR-0001 §ADR-1.1), тому частина платежів
 * зривається. Live LiqPay-інтеграція — Phase 7; цей модуль лише фіксує
 * контракт (`BillingProvider`) і resolver (`getEnabledProviders`), щоб
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
  BillingSubscriptionStatus,
} from "@sergeant/shared";
import { env } from "../../env/env.js";

/**
 * Канонічний набір payment-provider-ів. Узгоджено з CHECK-constraint
 * `subscriptions_provider_check` (migration 081) — мінус `manual`, який
 * не має checkout-flow (seeded/admin-granted), і мінус `apple`/`google`,
 * що йдуть через native IAP, а не через цей web-billing resolver.
 *
 * Phase 7 UA billing: `liqpay` (ПриватБанк) і `plata` (monobank) — live
 * UA-provider-и; `stripe` — dormant за `STRIPE_ENABLED` (пропонується лише
 * коли прапорець увімкнено, лишається у репо для легкого реверту).
 */
export type ProviderId = "stripe" | "liqpay" | "plata";

/**
 * Кинуто, коли provider увімкнено, але його ключі/секрети не сконфігуровані
 * (наприклад `LIQPAY_ENABLED=true`, але `LIQPAY_PRIVATE_KEY` порожній).
 * Route-layer мапить це на `503 BILLING_UNAVAILABLE`. Один канонічний клас
 * на всі провайдери (stripe/liqpay/plata re-export/import його).
 */
export class BillingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

/**
 * Провайдер відповів, що такої підписки в нього вже нема (LiqPay
 * `order_not_found`, Stripe 404). Для користувацького скасування це така сама
 * відмова, як інші (роут віддає 502), а для заміни старої підписки новою - успіх:
 * списувати нічого, тож нова оплачена підписка не мусить на цьому застрягати.
 */
export class ProviderSubscriptionGoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderSubscriptionGoneError";
  }
}

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
  ): Promise<BillingSubscriptionStatus>;
  /** Верифікує підпис вхідного webhook-запиту (provider-specific). */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  /** Обробляє верифікований webhook → upsert у `subscriptions`. */
  processWebhook(pool: Pool, rawBody: string): Promise<void>;
  /**
   * Скасовує активну підписку користувача. Жоден UA-provider не має
   * Customer Portal (як Stripe), тож скасування йде через власну кнопку в
   * застосунку: LiqPay → `action:unsubscribe`; Plata → `subscription/edit`
   * (`action:cancel`). Idempotent: повторний виклик на вже скасованій
   * (`cancel_at_period_end`) підписці провайдера не смикає і повертає
   * `already_canceling`.
   *
   * Результат каже викликачеві, що сталось насправді — без нього роут
   * відповідав `ok` навіть тоді, коли скасовувати було нічого
   * ({@link CancelSubscriptionOutcome}). Провайдер-помилка = `throw`; caller
   * логує й вирішує сам: deletion юзера й admin-downgrade продовжують
   * (ADR-0016), користувацький `/api/billing/cancel` віддає 502.
   */
  cancelSubscription(
    pool: Pool,
    userId: string,
  ): Promise<CancelSubscriptionOutcome>;
}

/**
 * Що зробив {@link BillingProvider.cancelSubscription}:
 *  - `canceled` — провайдеру наказано зупинити списання, `cancel_at_period_end`
 *    виставлено;
 *  - `already_canceling` — підписка вже скасована до кінця періоду, провайдера
 *    не чіпали;
 *  - `none` — у цього провайдера в користувача немає активної підписки.
 */
export type CancelSubscriptionOutcome =
  "canceled" | "already_canceling" | "none";

/**
 * Чи білінг узагалі увімкнено — тобто чи приймає гроші бодай один провайдер.
 *
 * Навмисно НЕ прив'язано до жодного конкретного прапорця. Гейт платних
 * поверхонь (`requirePlan`) раніше читав лише `STRIPE_ENABLED`, а в проді
 * Stripe dormant (гроші йдуть через LiqPay і Plata) — тож усі чотири
 * Pro-роути (`ai-memory`, `transcribe`, `nutrition` x2) віддавались
 * безкоштовно кожному залогіненому користувачу. Прапорець одного провайдера
 * ніколи не є відповіддю на питання «чи ми продаємо Pro».
 *
 * Усі три вимкнені = білінг ще не запущено (локально / preview) → гейт
 * пропускає, як і раніше.
 */
export interface BillingEnforcementOptions {
  /** Override `env.STRIPE_ENABLED` (для тестів). */
  stripeEnabled?: boolean;
  /** Override `env.LIQPAY_ENABLED`. */
  liqpayEnabled?: boolean;
  /** Override `env.PLATA_ENABLED`. */
  plataEnabled?: boolean;
}

export function isBillingEnforced({
  stripeEnabled = env.STRIPE_ENABLED,
  liqpayEnabled = env.LIQPAY_ENABLED,
  plataEnabled = env.PLATA_ENABLED,
}: BillingEnforcementOptions = {}): boolean {
  return stripeEnabled || liqpayEnabled || plataEnabled;
}

export interface EnabledProvidersOptions {
  /** Override `env.LIQPAY_ENABLED` (для тестів). */
  liqpayEnabled?: boolean;
  /** Override `env.PLATA_ENABLED`. */
  plataEnabled?: boolean;
  /** Override `env.STRIPE_ENABLED`. */
  stripeEnabled?: boolean;
}

/**
 * Кинуто, коли користувач обрав provider із вимкненим прапорцем (наприклад
 * `stripe` при `STRIPE_ENABLED=false`). Route-layer мапить це на
 * `400 PROVIDER_UNAVAILABLE`.
 */
export class ProviderNotAvailableError extends Error {
  constructor(public readonly providerId: string) {
    super(`Provider '${providerId}' is not available for this user`);
    this.name = "ProviderNotAvailableError";
  }
}

/**
 * Повертає впорядкований список payment-provider-ів, увімкнених прапорцями.
 * Це джерело правди для UI-кнопок на `/pricing` і для валідації в
 * {@link resolveProvider}.
 *
 * Країну користувача тут свідомо НЕ враховуємо (sec-33 / logic-33, рішення
 * власника 2026-11-21). Раніше роут брав її з `X-Vercel-IP-Country`, але
 * бекенд стоїть на Hetzner/Coolify без Vercel перед собою, тож заголовок
 * повністю задавав клієнт: `US` відкривав «сплячий» Stripe-checkout, а
 * справжні іноземці без заголовка отримували UA-набір. Тепер список один для
 * всіх: UA-провайдери (`liqpay`, `plata`) за своїми прапорцями, `stripe` лише
 * за `STRIPE_ENABLED=true`. Порядок фіксований: LiqPay, Plata, Stripe.
 */
export function getEnabledProviders({
  liqpayEnabled = env.LIQPAY_ENABLED,
  plataEnabled = env.PLATA_ENABLED,
  stripeEnabled = env.STRIPE_ENABLED,
}: EnabledProvidersOptions = {}): ProviderId[] {
  const providers: ProviderId[] = [];
  if (liqpayEnabled) providers.push("liqpay");
  if (plataEnabled) providers.push("plata");
  if (stripeEnabled) providers.push("stripe");
  return providers;
}

/**
 * Валідує provider, обраний користувачем на checkout, проти
 * {@link getEnabledProviders}. Повертає той самий `id`, якщо він дозволений;
 * інакше кидає {@link ProviderNotAvailableError}. Захищає від підробленого
 * `provider` у тілі запиту (наприклад `stripe` при вимкненому прапорці).
 */
export function resolveProvider(
  id: ProviderId,
  options: EnabledProvidersOptions = {},
): ProviderId {
  if (!getEnabledProviders(options).includes(id)) {
    throw new ProviderNotAvailableError(id);
  }
  return id;
}
