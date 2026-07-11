/**
 * Plata by mono (monopay) payment-provider — live (Phase 7 UA billing).
 *
 * Plata = еквайринг monobank, привʼязаний до українського ФОП. На відміну
 * від LiqPay, monopay НЕ має провайдер-керованої auto-subscribe, тож
 * рекурентка — **самокерована (token-billing)**: перший платіж створюємо з
 * `saveCardData` → у webhook отримуємо `walletId` + `cardToken` → далі наш
 * {@link ./plataScheduler} щомісяця списує через `wallet/payment`.
 *
 * Auth — header `X-Token` (merchant token, `PLATA_TOKEN`). Webhook
 * підписаний ECDSA (`X-Sign`, base64) над сирим тілом; верифікуємо проти
 * pubkey з `GET /api/merchant/pubkey` (кешуємо з TTL, рефетч при rotation).
 *
 * verifyWebhookSignature на інтерфейсі — SYNC (читає кешований pubkey);
 * warm-up і retry-on-rotation тримає async {@link ensurePlataPubkey}, який
 * route await-ить перед verify. Секрети (`PLATA_TOKEN`, card-token) ніколи
 * не логуються (Hard Rule #21).
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
import { decryptToken, encryptToken } from "../mono/crypto.js";
import {
  BillingConfigurationError,
  type BillingProvider,
  type ProviderCheckoutInput,
  type ProviderPortalInput,
} from "./provider.js";
import { isoOrNull } from "./stripeShared.js";

const MONOPAY_BASE = "https://api.monobank.ua/api/merchant";
const CCY_UAH = 980;
const INVOICE_VALIDITY_SECONDS = 3600;
const PUBKEY_TTL_MS = 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const SUCCESS = "success";

function getToken(): string {
  const token = env.PLATA_TOKEN;
  if (!token) {
    throw new BillingConfigurationError("PLATA_TOKEN is not set");
  }
  return token;
}

/**
 * Ключ для шифрування card-token-а. Дзеркалить mono-token AES-256-GCM
 * (m008) — reuse `MONO_TOKEN_ENC_KEY`, той самий crypto-util
 * (`encryptToken`). Card-token Plata — того ж класу секрет (дає списувати).
 */
function getEncKey(): string {
  const key = process.env["MONO_TOKEN_ENC_KEY"];
  if (!key) {
    throw new BillingConfigurationError(
      "MONO_TOKEN_ENC_KEY is required to encrypt the Plata card token",
    );
  }
  return key;
}

function getAppBaseUrl(): string {
  return (
    process.env["PUBLIC_WEB_BASE_URL"] ||
    process.env["VITE_PUBLIC_APP_URL"] ||
    process.env["BETTER_AUTH_URL"] ||
    "http://localhost:5173"
  ).replace(/\/+$/, "");
}

function serverBaseUrl(): string {
  return getAppBaseUrl().replace(/:5173$/, ":3000");
}

// ── pubkey cache (ECDSA webhook verify) ──────────────────────────────
let cachedPubkey: { key: crypto.KeyObject; fetchedAt: number } | null = null;

function parsePubkey(raw: string): crypto.KeyObject {
  // monopay віддає base64 публічного ключа. Може бути base64(PEM) або
  // base64(DER). Пробуємо PEM-декод, інакше DER.
  const decoded = Buffer.from(raw, "base64").toString("utf8");
  if (decoded.includes("BEGIN")) {
    return crypto.createPublicKey(decoded);
  }
  return crypto.createPublicKey({
    key: Buffer.from(raw, "base64"),
    format: "der",
    type: "spki",
  });
}

/**
 * Гарантує свіжий кешований pubkey. `force` — рефетч при verify-fail
 * (rotation). Route await-ить це перед verify. Експортовано для тестів.
 */
export async function ensurePlataPubkey(force = false): Promise<void> {
  const now = Date.now();
  if (!force && cachedPubkey && now - cachedPubkey.fetchedAt < PUBKEY_TTL_MS) {
    return;
  }
  const response = await fetch(`${MONOPAY_BASE}/pubkey`, {
    headers: { "X-Token": getToken() },
  });
  if (!response.ok) {
    throw new Error(`monopay pubkey fetch failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { key?: string };
  if (!body.key) throw new Error("monopay pubkey response missing 'key'");
  cachedPubkey = { key: parsePubkey(body.key), fetchedAt: now };
}

/** Тест-хук: інжектнути pubkey без мережі. */
export function __setPlataPubkeyForTesting(key: crypto.KeyObject | null): void {
  cachedPubkey = key ? { key, fetchedAt: Date.now() } : null;
}

// ── invoice / webhook shapes ─────────────────────────────────────────
interface PlataWebhook {
  invoiceId?: string;
  status?: string;
  amount?: number;
  ccy?: number;
  reference?: string;
  walletData?: { cardToken?: string; walletId?: string };
}

export function parsePlataWebhook(rawBody: string): PlataWebhook {
  return JSON.parse(rawBody) as PlataWebhook;
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
 * Зберігає card-token зашифровано у plata_card_token (AES-256-GCM, дзеркало
 * mono_connection). Upsert по user_id. Експортовано для scheduler-а.
 */
export async function storePlataCardToken(
  pool: Pool,
  userId: string,
  walletId: string,
  cardToken: string,
): Promise<void> {
  const enc = encryptToken(cardToken, getEncKey());
  await pool.query(
    `INSERT INTO plata_card_token
       (user_id, wallet_id, card_token_ciphertext, card_token_iv, card_token_tag)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       wallet_id = EXCLUDED.wallet_id,
       card_token_ciphertext = EXCLUDED.card_token_ciphertext,
       card_token_iv = EXCLUDED.card_token_iv,
       card_token_tag = EXCLUDED.card_token_tag,
       updated_at = NOW()`,
    [userId, walletId, enc.ciphertext, enc.iv, enc.tag],
  );
}

export const plataProvider: BillingProvider = {
  id: "plata",

  async createCheckoutSession(
    input: ProviderCheckoutInput,
  ): Promise<BillingCheckoutResponse> {
    const token = getToken();
    const baseUrl = getAppBaseUrl();
    const body = {
      amount: env.PRO_MONTHLY_UAH_KOPIYKAS, // копійки як є (Hard Rule #1)
      ccy: CCY_UAH,
      merchantPaymInfo: {
        reference: input.user.id, // мапимо юзера у webhook
        destination: "Sergeant Pro — місячна підписка",
      },
      redirectUrl: `${baseUrl}/pricing?checkout=success`,
      webHookUrl: `${serverBaseUrl()}/api/billing/plata-webhook`,
      validity: INVOICE_VALIDITY_SECONDS,
      paymentType: "debit",
      saveCardData: { saveCard: true },
    };
    const response = await fetch(`${MONOPAY_BASE}/invoice/create`, {
      method: "POST",
      headers: { "X-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      invoiceId?: string;
      pageUrl?: string;
      errText?: string;
    };
    if (!response.ok || !payload.invoiceId || !payload.pageUrl) {
      throw new Error(payload.errText || "monopay invoice/create failed");
    }
    return {
      ok: true,
      mode: env.PLATA_MODE,
      sessionId: payload.invoiceId,
      url: payload.pageUrl,
    };
  },

  createCustomerPortalSession(
    _input: ProviderPortalInput,
  ): Promise<BillingPortalResponse> {
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

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!cachedPubkey) return false; // route warm-ить pubkey перед verify
    try {
      return crypto.verify(
        "sha256",
        Buffer.from(rawBody, "utf8"),
        cachedPubkey.key,
        Buffer.from(signature, "base64"),
      );
    } catch {
      return false;
    }
  },

  async processWebhook(pool: Pool, rawBody: string): Promise<void> {
    const wh = parsePlataWebhook(rawBody);
    const invoiceId = wh.invoiceId;
    const userId = wh.reference;
    if (!invoiceId || !userId) {
      logger.warn({ msg: "plata_webhook_unresolved", invoiceId });
      return;
    }

    // Idempotency: dedup по (provider, invoiceId+status) — один invoice
    // проходить кілька статусів (created→processing→success).
    const inserted = await pool.query(
      `INSERT INTO billing_webhook_events (provider, provider_event_id, event_type, payload)
       VALUES ('plata', $1, $2, $3)
       ON CONFLICT (provider, provider_event_id) DO NOTHING
       RETURNING id`,
      [`${invoiceId}:${wh.status ?? ""}`, wh.status ?? "unknown", rawBody],
    );
    if (inserted.rowCount === 0) return;

    const status = wh.status ?? "";
    if (status === "failure" || status === "expired" || status === "reversed") {
      await pool.query(
        `UPDATE subscriptions
            SET status = 'past_due', updated_at = NOW()
          WHERE user_id = $1 AND provider = 'plata' AND status = 'active'`,
        [userId],
      );
      return;
    }
    if (status !== SUCCESS) return; // created/processing — чекаємо фінал

    // Успіх: зберегти токен (якщо прийшов) і активувати підписку.
    if (wh.walletData?.cardToken && wh.walletData.walletId) {
      await storePlataCardToken(
        pool,
        userId,
        wh.walletData.walletId,
        wh.walletData.cardToken,
      );
    }
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    await pool.query(
      `INSERT INTO subscriptions
         (user_id, provider, plan, status, provider_subscription_id, current_period_end)
       VALUES ($1, 'plata', 'pro', 'active', $2, $3)
       ON CONFLICT (user_id) WHERE status IN ('active', 'trialing', 'past_due') DO UPDATE SET
         plan = EXCLUDED.plan,
         status = 'active',
         provider = 'plata',
         provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, subscriptions.provider_subscription_id),
         current_period_end = EXCLUDED.current_period_end,
         updated_at = NOW()`,
      [userId, invoiceId, periodEnd],
    );
  },

  async cancelSubscription(pool: Pool, userId: string): Promise<void> {
    // Stop-scheduler ефект: прибрати локальний card-token → наступний tick
    // не знайде чим списувати (це і є справжнє «зупинити рекурентку»).
    // Додатково — best-effort delete токена в monopay (не валимо на помилці).
    const { rows } = await pool.query<{
      card_token_ciphertext: Buffer;
      card_token_iv: Buffer;
      card_token_tag: Buffer;
    }>(
      `SELECT card_token_ciphertext, card_token_iv, card_token_tag
         FROM plata_card_token WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    let cardToken: string | null = null;
    if (row) {
      try {
        cardToken = decryptToken(
          {
            ciphertext: row.card_token_ciphertext,
            iv: row.card_token_iv,
            tag: row.card_token_tag,
          },
          getEncKey(),
        );
      } catch {
        cardToken = null; // не змогли розшифрувати — локального delete досить
      }
    }
    await pool.query(`DELETE FROM plata_card_token WHERE user_id = $1`, [
      userId,
    ]);
    if (cardToken) {
      try {
        await fetch(`${MONOPAY_BASE}/wallet/card`, {
          method: "DELETE",
          headers: {
            "X-Token": getToken(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cardToken }),
        });
      } catch (err) {
        logger.warn({
          msg: "plata_wallet_card_delete_failed",
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    // Доступ до кінця періоду (ADR-1.11).
    await pool.query(
      `UPDATE subscriptions
          SET cancel_at_period_end = TRUE, updated_at = NOW()
        WHERE user_id = $1 AND provider = 'plata'
          AND status IN ('active', 'trialing', 'past_due')`,
      [userId],
    );
  },
};
