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
 * `subscriptions_provider_check` (migration 081) — мінус `manual`, який
 * не має checkout-flow (seeded/admin-granted), і мінус `apple`/`google`,
 * що йдуть через native IAP, а не через цей web-billing resolver.
 *
 * Phase 7 UA billing: `liqpay` (ПриватБанк) і `plata` (monobank) — live
 * UA-provider-и; `stripe` — dormant за флагом (ніколи не пропонується
 * українцям, лишається у репо для легкого реверту).
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
  /**
   * Скасовує активну підписку користувача. Жоден UA-provider не має
   * Customer Portal (як Stripe), тож скасування йде через власну кнопку в
   * застосунку: LiqPay → `action:unsubscribe`; Plata → stop-scheduler +
   * видалення card-token. Idempotent (повторний виклик на вже скасованій —
   * no-op). Best-effort: провайдер-помилка не мусить валити deletion юзера
   * (ADR-0016) — caller логує й продовжує.
   */
  cancelSubscription(pool: Pool, userId: string): Promise<void>;
}

export interface EnabledProvidersOptions {
  /** ISO-3166 alpha-2 країна користувача (наприклад `"UA"`, `"US"`). */
  country?: string | null;
  /** Override `env.LIQPAY_ENABLED` (для тестів / майбутнього flag-rollout-у). */
  liqpayEnabled?: boolean;
  /** Override `env.PLATA_ENABLED`. */
  plataEnabled?: boolean;
}

/**
 * Кинуто, коли користувач обрав provider, недоступний у його країні
 * (наприклад `stripe` для UA, або provider з вимкненим флагом). Route-layer
 * мапить це на `400 PROVIDER_UNAVAILABLE`.
 */
export class ProviderNotAvailableError extends Error {
  constructor(public readonly providerId: string) {
    super(`Provider '${providerId}' is not available for this user`);
    this.name = "ProviderNotAvailableError";
  }
}

/**
 * Повертає впорядкований список payment-provider-ів, доступних користувачу з
 * `country`. Це джерело правди для UI-кнопок на `/pricing` і для
 * валідації в {@link resolveProvider}.
 *
 * Phase 7 UA billing: для `country==='UA'` пропонуємо лише увімкнені
 * UA-provider-и (`liqpay`, `plata`) — **Stripe свідомо ніколи не потрапляє
 * у список для українців** (dormant). Для решти країн — `['stripe']`
 * (canonical). Порядок фіксований: LiqPay перший (scaffold готовий, менший
 * ризик), Plata другий.
 */
export function getEnabledProviders({
  country,
  liqpayEnabled = env.LIQPAY_ENABLED,
  plataEnabled = env.PLATA_ENABLED,
}: EnabledProvidersOptions = {}): ProviderId[] {
  if (country?.toUpperCase() === "UA") {
    const providers: ProviderId[] = [];
    if (liqpayEnabled) providers.push("liqpay");
    if (plataEnabled) providers.push("plata");
    return providers;
  }
  return ["stripe"];
}

/**
 * Валідує provider, обраний користувачем на checkout, проти
 * {@link getEnabledProviders}. Повертає той самий `id`, якщо він дозволений;
 * інакше кидає {@link ProviderNotAvailableError}. Захищає від підробленого
 * `provider` у тілі запиту (наприклад `stripe` від UA-юзера).
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
