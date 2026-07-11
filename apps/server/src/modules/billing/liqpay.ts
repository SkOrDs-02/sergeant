/**
 * LiqPay payment-provider — live (Phase 7 UA billing).
 *
 * LiqPay = еквайринг ПриватБанку, привʼязаний до українського ФОП. Модель
 * рекурентки — **провайдер-керована**: `action:subscribe, subscribe:1,
 * subscribe_periodicity:month` → LiqPay сам щомісяця списує й шле callback
 * `action:regular`. Ми лише обробляємо вхідні callback-и; скасування —
 * `action:unsubscribe` (server-to-server).
 *
 * Транспорт усюди — пара `data` = base64(JSON), `signature` =
 * base64(sha1(private_key + data + private_key)). Доку LiqPay має
 * розбіжність (опис згадує sha3-256, але ВСІ код-приклади — sha1); робоча
 * реалізація — sha1, зафіксовано константою {@link SIGNATURE_ALGO}. Якщо
 * акаунт колись перемкнуть на sha3-256 — міняється лише ця константа.
 *
 * Секрети (`LIQPAY_PRIVATE_KEY`) ніколи не логуються (Hard Rule #21).
 */
import crypto from "node:crypto";
import type { Pool } from "pg";
import type {
  BillingCheckoutResponse,
  BillingPortalResponse,
  BillingStatusResponse,
} from "@sergeant/shared";
import { env } from "../../env/env.js";
import { logger } from "../../obs/logger.js";
import {
  BillingConfigurationError,
  type BillingProvider,
  type ProviderCheckoutInput,
  type ProviderPortalInput,
} from "./provider.js";
import { isoOrNull } from "./stripeShared.js";

const LIQPAY_CHECKOUT_URL = "https://www.liqpay.ua/api/3/checkout";
const LIQPAY_REQUEST_URL = "https://www.liqpay.ua/api/request";
const LIQPAY_API_VERSION = 3;
/** Алгоритм підпису. Доку розбіжна (sha3-256 в описі), робочі приклади — sha1. */
const SIGNATURE_ALGO = "sha1" as const;
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/** LiqPay `status`-и, що означають успішне списання/підписку. */
const SUCCESS_STATUSES = new Set(["success", "subscribed", "sandbox"]);
/** Проміжний 3DS-стан — фінального рішення ще нема, підписку не чіпаємо. */
const PENDING_STATUSES = new Set(["wait_secure", "wait_accept", "processing"]);

interface LiqPayKeys {
  publicKey: string;
  privateKey: string;
}

function getKeys(): LiqPayKeys {
  const publicKey = env.LIQPAY_PUBLIC_KEY;
  const privateKey = env.LIQPAY_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new BillingConfigurationError(
      "LIQPAY_PUBLIC_KEY / LIQPAY_PRIVATE_KEY are not set",
    );
  }
  return { publicKey, privateKey };
}

function getAppBaseUrl(): string {
  return (
    process.env["PUBLIC_WEB_BASE_URL"] ||
    process.env["VITE_PUBLIC_APP_URL"] ||
    process.env["BETTER_AUTH_URL"] ||
    "http://localhost:5173"
  ).replace(/\/+$/, "");
}

/** Sandbox-ключі LiqPay мають префікс `sandbox_` у public_key. */
function modeFromPublicKey(publicKey: string): "test" | "live" {
  return publicKey.startsWith("sandbox_") ? "test" : "live";
}

/**
 * `data` = base64(JSON). Експортовано для тестів.
 */
export function encodeData(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

/**
 * signature = base64(sha1(private_key + data + private_key)). Експортовано
 * для тестів і повторного використання у verify.
 */
export function signData(data: string, privateKey: string): string {
  return crypto
    .createHash(SIGNATURE_ALGO)
    .update(privateKey + data + privateKey, "utf8")
    .digest("base64");
}

/**
 * order_id кодує userId у hex, щоб callback відновив користувача без
 * окремої mapping-таблиці. hex-charset `[0-9a-f]` не конфліктує з
 * роздільником `_`. Формат: `srg_<hex(userId)>_<nonce>`.
 */
export function encodeOrderId(userId: string): string {
  const hex = Buffer.from(userId, "utf8").toString("hex");
  const nonce = crypto.randomBytes(8).toString("hex");
  return `srg_${hex}_${nonce}`;
}

export function decodeUserIdFromOrderId(orderId: string): string | null {
  const parts = orderId.split("_");
  if (parts.length < 3 || parts[0] !== "srg") return null;
  try {
    const decoded = Buffer.from(parts[1] ?? "", "hex").toString("utf8");
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

interface LiqPayCallback {
  status?: string;
  action?: string;
  order_id?: string;
  payment_id?: string | number;
  transaction_id?: string | number;
  amount?: number;
  currency?: string;
  err_code?: string;
  err_description?: string;
}

/** Розбирає base64 `data` → callback JSON. Експортовано для тестів. */
export function parseCallbackData(data: string): LiqPayCallback {
  const json = Buffer.from(data, "base64").toString("utf8");
  return JSON.parse(json) as LiqPayCallback;
}

interface BillingRow {
  id: string | number;
  provider: string;
  plan: string | null;
  status: string;
  current_period_end: Date | string | null;
}

function serializeBillingRow(row: BillingRow | null): BillingStatusResponse {
  return {
    subscription: row
      ? {
          id: Number(row.id),
          provider:
            row.provider as BillingStatusResponse["subscription"]["provider"],
          plan: row.plan as BillingStatusResponse["subscription"]["plan"],
          status: row.status,
          active: ACTIVE_STATUSES.has(row.status),
          currentPeriodEnd: isoOrNull(row.current_period_end),
        }
      : {
          id: null,
          provider: null,
          plan: null,
          status: null,
          active: false,
          currentPeriodEnd: null,
        },
  };
}

async function readLatestSubscription(
  pool: Pool,
  userId: string,
): Promise<BillingRow | null> {
  const { rows } = await pool.query<BillingRow>(
    `SELECT id, provider, plan, status, current_period_end
       FROM subscriptions
      WHERE user_id = $1
      ORDER BY
        CASE WHEN status IN ('active', 'trialing') THEN 0 ELSE 1 END,
        updated_at DESC
      LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Місячна ціна Pro у гривнях-decimal для LiqPay `amount`
 * (env тримає копійки як number — Hard Rule #1; ділимо на 100 на межі).
 */
function proAmountUah(): number {
  return env.PRO_MONTHLY_UAH_KOPIYKAS / 100;
}

/** `YYYY-MM-DD HH:MM:SS` у UTC — формат LiqPay `subscribe_date_start`. */
function liqpayDateStart(now: Date): string {
  return now.toISOString().slice(0, 19).replace("T", " ");
}

export const liqpayProvider: BillingProvider = {
  id: "liqpay",

  async createCheckoutSession(
    input: ProviderCheckoutInput,
  ): Promise<BillingCheckoutResponse> {
    const { publicKey, privateKey } = getKeys();
    const baseUrl = getAppBaseUrl();
    const orderId = encodeOrderId(input.user.id);
    const payload = {
      version: LIQPAY_API_VERSION,
      public_key: publicKey,
      action: "subscribe",
      amount: proAmountUah(),
      currency: "UAH",
      description: "Sergeant Pro — місячна підписка",
      order_id: orderId,
      subscribe: 1,
      subscribe_date_start: liqpayDateStart(new Date()),
      subscribe_periodicity: "month",
      server_url: `${baseUrl.replace(/:5173$/, ":3000")}/api/billing/liqpay-callback`,
      result_url: `${baseUrl}/pricing?checkout=success`,
    };
    const data = encodeData(payload);
    const signature = signData(data, privateKey);
    const url = `${LIQPAY_CHECKOUT_URL}?data=${encodeURIComponent(
      data,
    )}&signature=${encodeURIComponent(signature)}`;

    // Рядок у subscriptions створюється callback-ом (як у Stripe-flow) —
    // тут не INSERT-имо 'incomplete'-псевдостатус.
    return {
      ok: true,
      mode: modeFromPublicKey(publicKey),
      sessionId: orderId,
      url,
    };
  },

  createCustomerPortalSession(
    _input: ProviderPortalInput,
  ): Promise<BillingPortalResponse> {
    // LiqPay не має Customer Portal — керування через власну кнопку в
    // застосунку (Settings → «Скасувати Pro» → POST /api/billing/cancel).
    return Promise.resolve({
      ok: true,
      url: `${getAppBaseUrl()}/settings?billing=manage`,
    });
  },

  getSubscriptionStatus(
    pool: Pool,
    userId: string,
  ): Promise<BillingStatusResponse> {
    return readLatestSubscription(pool, userId).then(serializeBillingRow);
  },

  verifyWebhookSignature(data: string, signature: string): boolean {
    const { privateKey } = getKeys();
    return timingSafeEqualStr(signData(data, privateKey), signature);
  },

  async processWebhook(pool: Pool, data: string): Promise<void> {
    const cb = parseCallbackData(data);
    const orderId = cb.order_id;
    if (!orderId) return;
    const userId = decodeUserIdFromOrderId(orderId);
    if (!userId) {
      logger.warn({ msg: "liqpay_callback_unresolved_order", orderId });
      return;
    }

    const status = cb.status ?? "";
    const action = cb.action ?? "";

    // Idempotency: dedup по (provider, provider_event_id). Природний ключ —
    // payment_id/transaction_id; fallback — order_id:status для callback-ів
    // без payment id (наприклад unsubscribe-підтвердження).
    const eventId = String(
      cb.payment_id ?? cb.transaction_id ?? `${orderId}:${status}:${action}`,
    );
    const inserted = await pool.query(
      `INSERT INTO billing_webhook_events (provider, provider_event_id, event_type, payload)
       VALUES ('liqpay', $1, $2, $3)
       ON CONFLICT (provider, provider_event_id) DO NOTHING
       RETURNING id`,
      [eventId, `${action}:${status}`, JSON.stringify(cb)],
    );
    if (inserted.rowCount === 0) {
      // Повторна доставка — вже оброблено.
      return;
    }

    const isCancel = action === "unsubscribe" || status === "reversed";
    if (isCancel) {
      await pool.query(
        `UPDATE subscriptions
            SET status = 'canceled', updated_at = NOW()
          WHERE user_id = $1 AND provider = 'liqpay'
            AND status IN ('active', 'trialing', 'past_due')`,
        [userId],
      );
      return;
    }

    if (PENDING_STATUSES.has(status)) {
      // 3DS-очікування — фінальний callback прийде окремо.
      return;
    }

    if (SUCCESS_STATUSES.has(status)) {
      // Наступне списання LiqPay робить сам через місяць (action:regular).
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await pool.query(
        `INSERT INTO subscriptions
           (user_id, provider, plan, status, provider_subscription_id, current_period_end)
         VALUES ($1, 'liqpay', 'pro', 'active', $2, $3)
         ON CONFLICT (user_id) WHERE status IN ('active', 'trialing', 'past_due') DO UPDATE SET
           plan = EXCLUDED.plan,
           status = 'active',
           provider = 'liqpay',
           provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, subscriptions.provider_subscription_id),
           current_period_end = EXCLUDED.current_period_end,
           updated_at = NOW()`,
        [userId, orderId, periodEnd],
      );
      return;
    }

    // Решта (`failure`, `error`) — невдале списання. Якщо це рекурентка на
    // активній підписці → past_due (dunning); інакше ігноруємо (перший
    // checkout просто не створює рядок).
    await pool.query(
      `UPDATE subscriptions
          SET status = 'past_due', updated_at = NOW()
        WHERE user_id = $1 AND provider = 'liqpay' AND status = 'active'`,
      [userId],
    );
  },

  async cancelSubscription(pool: Pool, userId: string): Promise<void> {
    const { rows } = await pool.query<{
      provider_subscription_id: string | null;
    }>(
      `SELECT provider_subscription_id
         FROM subscriptions
        WHERE user_id = $1 AND provider = 'liqpay'
          AND status IN ('active', 'trialing', 'past_due')
        ORDER BY updated_at DESC
        LIMIT 1`,
      [userId],
    );
    const orderId = rows[0]?.provider_subscription_id;
    if (!orderId) return; // нема активної LiqPay-підписки — no-op

    const { privateKey, publicKey } = getKeys();
    const payload = {
      version: LIQPAY_API_VERSION,
      public_key: publicKey,
      action: "unsubscribe",
      order_id: orderId,
    };
    const data = encodeData(payload);
    const signature = signData(data, privateKey);
    const body = new URLSearchParams({ data, signature });
    const response = await fetch(LIQPAY_REQUEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      throw new Error(`LiqPay unsubscribe failed: HTTP ${response.status}`);
    }

    // Доступ лишається до кінця оплаченого періоду (ADR-1.11 семантика).
    await pool.query(
      `UPDATE subscriptions
          SET cancel_at_period_end = TRUE, updated_at = NOW()
        WHERE user_id = $1 AND provider = 'liqpay'
          AND status IN ('active', 'trialing', 'past_due')`,
      [userId],
    );
  },
};
