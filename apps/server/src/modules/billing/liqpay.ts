/**
 * LiqPay payment-provider — SCAFFOLD ONLY (0010 PR-8).
 *
 * Кожен метод кидає `NotImplementedError`. Live-інтеграція (підпис
 * `data`+`signature` base64/SHA1, server-callback webhook, рекурентні
 * платежі через `subscribe`, cancel-flow) — Phase 7 (ADR-0001 §ADR-1.1).
 *
 * Призначення цього файлу — зафіксувати, що LiqPay реалізує
 * `BillingProvider`, щоб live-PR заповнив тіла методів, не торкаючись
 * resolver-а, routes чи api-client контракту.
 *
 * ⚠️ Цей модуль НЕ підключений до жодного route. `getProviderForCountry`
 * повертає `liqpay` лише коли `LIQPAY_ENABLED=true` (off до Phase 7), тому
 * у проді ці методи зараз недосяжні.
 */
import type { Pool } from "pg";
import type {
  BillingCheckoutResponse,
  BillingPortalResponse,
  BillingStatusResponse,
} from "@sergeant/shared";
import type {
  BillingProvider,
  ProviderCheckoutInput,
  ProviderPortalInput,
} from "./provider.js";

/**
 * Кидається кожним scaffold-методом LiqPay-провайдера. Окремий клас (а не
 * generic `Error`), щоб route-layer міг розрізнити «provider ще не
 * реалізований» від реальних billing-помилок і повернути 501/503.
 */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

const PHASE_7_NOTE =
  "LiqPay live integration is scheduled for Phase 7 (ADR-0001 §ADR-1.1). " +
  "This module is a multi-provider scaffold; method bodies are intentionally unimplemented.";

/** Sync throw — for the non-Promise `verifyWebhookSignature` method. */
function notImplemented(method: string): never {
  throw new NotImplementedError(`liqpayProvider.${method}: ${PHASE_7_NOTE}`);
}

/**
 * Rejected-promise variant — for the async methods. Returns a rejected
 * Promise rather than throwing synchronously so callers awaiting the
 * provider get a consistent rejection (not a sync throw during argument
 * evaluation).
 */
function rejectNotImplemented(method: string): Promise<never> {
  return Promise.reject(
    new NotImplementedError(`liqpayProvider.${method}: ${PHASE_7_NOTE}`),
  );
}

/**
 * LiqPay provider stub. Implements `BillingProvider` so the type-checker
 * proves the contract surface is complete; every method throws until the
 * Phase 7 live PR fills it in.
 */
export const liqpayProvider: BillingProvider = {
  id: "liqpay",

  createCheckoutSession(
    _input: ProviderCheckoutInput,
  ): Promise<BillingCheckoutResponse> {
    return rejectNotImplemented("createCheckoutSession");
  },

  createCustomerPortalSession(
    _input: ProviderPortalInput,
  ): Promise<BillingPortalResponse> {
    return rejectNotImplemented("createCustomerPortalSession");
  },

  getSubscriptionStatus(
    _pool: Pool,
    _userId: string,
  ): Promise<BillingStatusResponse> {
    return rejectNotImplemented("getSubscriptionStatus");
  },

  verifyWebhookSignature(_rawBody: string, _signature: string): boolean {
    return notImplemented("verifyWebhookSignature");
  },

  processWebhook(_pool: Pool, _rawBody: string): Promise<void> {
    return rejectNotImplemented("processWebhook");
  },
};
