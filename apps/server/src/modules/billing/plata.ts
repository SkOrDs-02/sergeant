/**
 * Plata by mono (monopay) payment-provider — native subscriptions (Phase 7 UA
 * billing, plata-recurring spec 2026-09-01).
 *
 * monobank ЄDE провайдер-керований auto-subscribe (`subscription/*`): один
 * виклик `subscription/create` заводить підписку, а періодичність, списання
 * і ретраї лишаються на боці monobank. Наш код лише слухає два webhook-и
 * (`chargeUrl`/`statusUrl`, обробляються цим самим `processWebhook`) і
 * звіряється полінгом `subscription/status` — {@link ./plataSync}.
 *
 * `subscription/create` не повертає `reference`, тож звʼязок «юзер ↔
 * subscriptionId» записуємо самі, у `plata_subscription`, до повернення
 * `pageUrl` викликачу (до редиректу).
 *
 * Auth — header `X-Token` (merchant token, `PLATA_TOKEN`). Webhook
 * підписаний ECDSA (`X-Sign`, base64) над сирим тілом; верифікуємо проти
 * pubkey з `GET /api/merchant/pubkey` (кешуємо з TTL, рефетч при rotation).
 *
 * verifyWebhookSignature на інтерфейсі — SYNC (читає кешований pubkey);
 * warm-up і retry-on-rotation тримає async {@link ensurePlataPubkey}, який
 * route await-ить перед verify. Секрети (`PLATA_TOKEN`) ніколи не логуються
 * (Hard Rule #21).
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
import { reconcileBySubscriptionId } from "./plataSync.js";
import { isoOrNull } from "./stripeShared.js";

export const MONOPAY_BASE = "https://api.monobank.ua/api/merchant";
const CCY_UAH = 980;
const SUBSCRIPTION_VALIDITY_SECONDS = 3600;
const PUBKEY_TTL_MS = 60 * 60 * 1000;
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function getToken(): string {
  const token = env.PLATA_TOKEN;
  if (!token) {
    throw new BillingConfigurationError("PLATA_TOKEN is not set");
  }
  return token;
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

/**
 * Тіло `chargeUrl`/`statusUrl` webhook-ів НЕ задокументоване (spec § Ризики).
 * Webhook не має права змінювати стан напряму — витягуємо лише
 * `subscriptionId`, толерантно (top-level або вкладений `data`), і тригеримо
 * звірку {@link reconcileBySubscriptionId}, яка бере стан з
 * `GET subscription/status`, не з цього payload-у.
 */
export function parseSubscriptionIdFromWebhook(rawBody: string): string | null {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const top = (body as Record<string, unknown>)["subscriptionId"];
  if (typeof top === "string" && top.length > 0) return top;
  const nested = (body as Record<string, unknown>)["data"];
  if (nested && typeof nested === "object") {
    const nestedId = (nested as Record<string, unknown>)["subscriptionId"];
    if (typeof nestedId === "string" && nestedId.length > 0) return nestedId;
  }
  return null;
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

async function findSubscriptionId(
  pool: Pool,
  userId: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ subscription_id: string }>(
    `SELECT subscription_id FROM plata_subscription WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.subscription_id ?? null;
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
      redirectUrl: `${baseUrl}/pricing?checkout=success`,
      webHookUrls: {
        chargeUrl: `${serverBaseUrl()}/api/billing/plata-charge`,
        statusUrl: `${serverBaseUrl()}/api/billing/plata-status`,
      },
      interval: "1m",
      validity: SUBSCRIPTION_VALIDITY_SECONDS,
    };
    const response = await fetch(`${MONOPAY_BASE}/subscription/create`, {
      method: "POST",
      headers: { "X-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      subscriptionId?: string;
      pageUrl?: string;
      errText?: string;
    };
    if (!response.ok || !payload.subscriptionId || !payload.pageUrl) {
      throw new Error(payload.errText || "monopay subscription/create failed");
    }
    // Записуємо мапінг ДО повернення pageUrl викликачу (до редиректу) —
    // subscription/create не має `reference`, тож це єдине місце, де звʼязок
    // «юзер ↔ subscriptionId» можна зафіксувати.
    await input.pool.query(
      `INSERT INTO plata_subscription (user_id, subscription_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         subscription_id = EXCLUDED.subscription_id,
         confirmed_at = NULL,
         updated_at = NOW()`,
      [input.user.id, payload.subscriptionId],
    );
    return {
      ok: true,
      mode: env.PLATA_MODE,
      sessionId: payload.subscriptionId,
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

  /**
   * Webhook НЕ пише у `subscriptions` напряму (spec § Рішення дизайну) —
   * лише дістає `subscriptionId` і тригерить звірку проти
   * `GET subscription/status`, яка є арбітром стану.
   */
  async processWebhook(pool: Pool, rawBody: string): Promise<void> {
    const subscriptionId = parseSubscriptionIdFromWebhook(rawBody);
    if (!subscriptionId) {
      logger.warn({ msg: "plata_webhook_unresolved" });
      return;
    }
    await reconcileBySubscriptionId(pool, subscriptionId);
  },

  /**
   * `edit action=cancel` без `refundAmount` (доступ до кінця періоду,
   * ADR-1.11). Fallback на `subscription/remove` при 404/400 — `remove`
   * працює лише поки за підпискою не було жодної оплати. Best-effort:
   * провайдер-помилка не валить локальне скасування (ADR-0016).
   */
  async cancelSubscription(pool: Pool, userId: string): Promise<void> {
    const subscriptionId = await findSubscriptionId(pool, userId);
    if (subscriptionId) {
      try {
        const token = getToken();
        const response = await fetch(`${MONOPAY_BASE}/subscription/edit`, {
          method: "POST",
          headers: {
            "X-Token": token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ subscriptionId, action: "cancel" }),
        });
        if (response.status === 404 || response.status === 400) {
          await fetch(`${MONOPAY_BASE}/subscription/remove`, {
            method: "POST",
            headers: {
              "X-Token": token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ subscriptionId }),
          });
        } else if (!response.ok) {
          logger.warn({
            msg: "plata_subscription_cancel_failed",
            status: response.status,
          });
        }
      } catch (err) {
        logger.warn({
          msg: "plata_subscription_cancel_error",
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    // Доступ до кінця періоду (ADR-1.11). WHERE-guard робить повторний
    // виклик на вже скасованій підписці no-op.
    await pool.query(
      `UPDATE subscriptions
          SET cancel_at_period_end = TRUE, updated_at = NOW()
        WHERE user_id = $1 AND provider = 'plata'
          AND status IN ('active', 'trialing', 'past_due')`,
      [userId],
    );
  },
};
