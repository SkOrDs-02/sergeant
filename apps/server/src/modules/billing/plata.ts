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
  BillingSubscriptionStatus,
} from "@sergeant/shared";
import { env } from "../../env/env.js";
import { logger } from "../../obs/logger.js";
import type {
  BillingProvider,
  CancelSubscriptionOutcome,
  ProviderCheckoutInput,
  ProviderPortalInput,
} from "./provider.js";
import { reconcileBySubscriptionId } from "./plataSync.js";
import {
  MONOPAY_BASE,
  cancelPlataRemoteSubscription,
  getPlataToken as getToken,
} from "./plataRemote.js";
import { isoOrNull } from "./stripeShared.js";

const CCY_UAH = 980;
/**
 * Скільки живе `pageUrl` (секунди). Це ж межа для 409 CHECKOUT_PENDING: доти
 * непідтверджений checkout ще може бути оплачений у іншій вкладці.
 */
export const SUBSCRIPTION_VALIDITY_SECONDS = 3600;
const PUBKEY_TTL_MS = 60 * 60 * 1000;
const PUBKEY_FORCE_COOLDOWN_MS = 60 * 1000;
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

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
  // Force приходить з анонімного вебхука з невалідним X-Sign; без cooldown
  // кожен такий запит робив би зовнішній fetch з нашим токеном.
  const ttl = force ? PUBKEY_FORCE_COOLDOWN_MS : PUBKEY_TTL_MS;
  if (cachedPubkey && now - cachedPubkey.fetchedAt < ttl) return;
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

/**
 * Прибирає `walletData.cardToken` перед тим, як payload ляже в
 * `billing_webhook_events`.
 *
 * AI-DANGER: без цієї функції аудит-запис відтворив би рівно те сховище
 * card-token, яке міграція 133 щойно знесла разом із `plata_card_token`.
 * monobank шле `cardToken` і в `chargeUrl`-тілі, і у відповіді
 * `subscription/status` (підтверджено живим прогоном 2026-09-01), тож
 * «просто зберегти payload як є» тихо повертає борг у JSONB-колонку, де за
 * ним ніхто не стежить. Токен нам не потрібен: рекурентку веде monobank.
 */
export function redactPlataPayload(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;
  const clone = { ...(parsed as Record<string, unknown>) };
  const wallet = clone["walletData"];
  if (wallet && typeof wallet === "object") {
    const { cardToken: _dropped, ...rest } = wallet as Record<string, unknown>;
    clone["walletData"] = rest;
  }
  return clone;
}

/**
 * Аудит-запис webhook-у в `billing_webhook_events` (m081 дозволив там
 * `provider = 'plata'`).
 *
 * Ключ — SHA-256 сирого тіла, а НЕ `invoiceId`, як припускала m081. Живий
 * прогін 2026-09-01 показав, чому: за одну оплату прилетіли ТРИ
 * `chargeUrl`-доставки з тим самим `invoiceId` (`processing`, далі двічі
 * `success` з різним станом гаманця). З `invoiceId` як ключем UNIQUE-індекс
 * лишив би тільки перший, `processing` — тобто аудит зберігав би рівно ту
 * подію, яка НЕ є фінальною. Хеш тіла дедуплікує справжні ретраї
 * (байт-у-байт та сама доставка) і не губить різні події.
 *
 * `statusUrl`-тіла взагалі не мають `invoiceId`, тож один ключ на обидва
 * роути можливий лише такий.
 *
 * Best-effort: збій аудиту не має валити webhook — стан однаково візьме
 * звірка, а 500 у відповідь змусив би monobank ретраїти справно оброблену
 * подію.
 */
async function recordWebhookEvent(pool: Pool, rawBody: string): Promise<void> {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    const hasInvoice =
      typeof parsed === "object" &&
      parsed !== null &&
      "invoiceId" in (parsed as Record<string, unknown>);
    await pool.query(
      `INSERT INTO billing_webhook_events
         (provider, provider_event_id, event_type, payload)
       VALUES ('plata', $1, $2, $3)
       ON CONFLICT (provider, provider_event_id) DO NOTHING`,
      [
        crypto.createHash("sha256").update(rawBody, "utf8").digest("hex"),
        hasInvoice ? "charge" : "status",
        JSON.stringify(redactPlataPayload(parsed)),
      ],
    );
  } catch (err) {
    logger.warn({
      msg: "plata_webhook_audit_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

interface BillingRow {
  id: string | number;
  provider: string;
  plan: string | null;
  status: string;
  current_period_end: Date | string | null;
  cancel_at_period_end: boolean;
}

function serializeBillingRow(
  row: BillingRow | null,
): BillingSubscriptionStatus {
  return {
    subscription: row
      ? {
          id: Number(row.id),
          provider:
            row.provider as BillingSubscriptionStatus["subscription"]["provider"],
          plan: row.plan as BillingSubscriptionStatus["subscription"]["plan"],
          status: row.status,
          active: ACTIVE_STATUSES.has(row.status),
          currentPeriodEnd: isoOrNull(row.current_period_end),
          cancelAtPeriodEnd: row.cancel_at_period_end === true,
        }
      : {
          id: null,
          provider: null,
          plan: null,
          status: null,
          active: false,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        },
  };
}

async function readLatestSubscription(
  pool: Pool,
  userId: string,
): Promise<BillingRow | null> {
  const { rows } = await pool.query<BillingRow>(
    `SELECT id, provider, plan, status, current_period_end, cancel_at_period_end
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
    // «юзер ↔ subscriptionId» можна зафіксувати. Мапінг 1:N (міграція 154):
    // кожен checkout - окремий рядок, тож вебхук по будь-якому з id
    // резолвиться, а попередній checkout не губиться (аудит data-21).
    await input.pool.query(
      `INSERT INTO plata_subscription (user_id, subscription_id)
       VALUES ($1, $2)
       ON CONFLICT (subscription_id) DO NOTHING`,
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
  ): Promise<BillingSubscriptionStatus> {
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
    await recordWebhookEvent(pool, rawBody);
    await reconcileBySubscriptionId(pool, subscriptionId);
  },

  /**
   * `edit action=cancel` без `refundAmount` (доступ до кінця періоду,
   * ADR-1.11), fallback на `subscription/remove` - див.
   * {@link cancelPlataRemoteSubscription}.
   *
   * Відмова monobank (не-2xx, мережа, таймаут) = `throw`: роут
   * `/api/billing/cancel` віддає 502 PROVIDER_CANCEL_FAILED, а
   * `cancel_at_period_end` НЕ ставиться, тож людина може повторити. Це
   * рішення власника 2026-10-10 (аудит data-20, варіант A: Plata поводиться
   * як LiqPay/Stripe). Раніше відмову ковтали й прапорець ставили все одно -
   * людині казали "скасовано", а monobank далі списував. Видалення акаунта
   * лишається best-effort (`notifyProvidersCancel` ловить throw, ADR-0016).
   *
   * Скасовуємо саме ту підписку, що тримає ентайтлмент
   * (`subscriptions.provider_subscription_id`), а не "останній checkout"
   * з мапінгу (аудит data-21).
   */
  async cancelSubscription(
    pool: Pool,
    userId: string,
  ): Promise<CancelSubscriptionOutcome> {
    const { rows } = await pool.query<{
      provider_subscription_id: string | null;
      cancel_at_period_end: boolean;
    }>(
      `SELECT provider_subscription_id, cancel_at_period_end
         FROM subscriptions
        WHERE user_id = $1 AND provider = 'plata'
          AND status IN ('active', 'trialing', 'past_due')
        ORDER BY updated_at DESC
        LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row) return "none"; // нема активної plata-підписки
    // Уже скасовано до кінця періоду — monobank вдруге не смикаємо.
    if (row.cancel_at_period_end === true) return "already_canceling";
    const subscriptionId = row.provider_subscription_id;
    if (!subscriptionId) return "none"; // без id провайдеру нічого не наказати

    await cancelPlataRemoteSubscription(subscriptionId);

    // Доступ до кінця періоду (ADR-1.11). Прапорець ставимо лише після
    // підтвердження monobank і лише тому рядку, чий id скасували.
    const updated = await pool.query(
      `UPDATE subscriptions
          SET cancel_at_period_end = TRUE, updated_at = NOW()
        WHERE user_id = $1 AND provider = 'plata'
          AND provider_subscription_id = $2
          AND status IN ('active', 'trialing', 'past_due')`,
      [userId, subscriptionId],
    );
    return (updated.rowCount ?? 0) > 0 ? "canceled" : "none";
  },
};
