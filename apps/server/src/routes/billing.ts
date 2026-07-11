import { Router } from "express";
import type { Request, Response } from "express";
import type { Pool } from "pg";
import {
  BillingCancelResponseSchema,
  BillingCheckoutRequestSchema,
  BillingCheckoutResponseSchema,
  BillingPortalResponseSchema,
  BillingProvidersResponseSchema,
  BillingStatusResponseSchema,
} from "@sergeant/shared";
import {
  rateLimitExpress,
  requireSession,
  setModule,
  parseBody,
} from "../http/index.js";
import {
  BillingConfigurationError,
  NoBillingCustomerError,
} from "../modules/billing/stripe.js";
import {
  ProviderNotAvailableError,
  getEnabledProviders,
  providerRegistry,
  resolveProvider,
  type ProviderId,
} from "../modules/billing/index.js";
import {
  liqpayProvider,
  verifyStripeSignature,
  processStripeWebhook,
} from "../modules/billing/index.js";
import { ensurePlataPubkey, plataProvider } from "../modules/billing/plata.js";
import { emitSecurityEvent } from "../obs/securityEvents.js";
import { logger } from "../obs/logger.js";
import { ValidationError } from "../obs/errors.js";

type AuthedRequest = Request & {
  user?: { id: string; email?: string | null };
};

function rawBody(req: Request): Buffer {
  return Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
}

/**
 * Країна юзера для resolver-а. Sergeant — UA-market, тож дефолт `UA`;
 * якщо перед сервером стоїть proxy з geo-хедером — беремо з нього.
 */
function userCountry(req: Request): string {
  const header = req.headers["x-vercel-ip-country"];
  const country = Array.isArray(header) ? header[0] : header;
  return (country && country.length === 2 ? country : "UA").toUpperCase();
}

function handleBillingError(err: unknown, res: Response): boolean {
  if (err instanceof ProviderNotAvailableError) {
    res.status(400).json({
      error: `Provider '${err.providerId}' is not available`,
      code: "PROVIDER_UNAVAILABLE",
    });
    return true;
  }
  if (err instanceof BillingConfigurationError) {
    res.status(503).json({
      error: "Billing is not configured",
      code: "BILLING_UNAVAILABLE",
    });
    return true;
  }
  if (err instanceof NoBillingCustomerError) {
    res.status(409).json({
      error: "User has no billing customer record",
      code: "NO_BILLING_CUSTOMER",
    });
    return true;
  }
  return false;
}

export function createBillingRouter({ pool }: { pool: Pool }): Router {
  const r = Router();
  r.use("/api/billing", setModule("billing"));

  // Список доступних провайдерів для кнопок на /pricing.
  r.get(
    "/api/billing/providers",
    requireSession(),
    (req: AuthedRequest, res: Response) => {
      const providers = getEnabledProviders({ country: userCountry(req) });
      res.json(BillingProvidersResponseSchema.parse({ providers }));
    },
  );

  r.post(
    "/api/billing/checkout",
    requireSession(),
    rateLimitExpress({
      key: "api:billing:checkout",
      limit: 10,
      windowMs: 60 * 60 * 1000,
    }),
    async (req: AuthedRequest, res: Response) => {
      const parsed = parseBody(BillingCheckoutRequestSchema, req);
      const country = userCountry(req);

      try {
        // Явний provider → валідуємо; інакше беремо перший enabled для країни.
        const providerId: ProviderId = parsed.provider
          ? resolveProvider(parsed.provider, { country })
          : (getEnabledProviders({ country })[0] ??
            (() => {
              throw new ProviderNotAvailableError("none");
            })());

        const payload = BillingCheckoutResponseSchema.parse(
          await providerRegistry[providerId].createCheckoutSession({
            pool,
            user: { id: req.user!.id, email: req.user!.email ?? null },
            plan: parsed.plan,
          }),
        );
        res.json(payload);
      } catch (err) {
        if (handleBillingError(err, res)) return;
        throw err;
      }
    },
  );

  r.get(
    "/api/billing/status",
    requireSession(),
    async (req: AuthedRequest, res: Response) => {
      // Уніфіковано через subscriptions — читаємо будь-яким провайдером
      // (усі три віддають ту саму serialize-форму з таблиці).
      const payload = BillingStatusResponseSchema.parse(
        await liqpayProvider.getSubscriptionStatus(pool, req.user!.id),
      );
      res.json(payload);
    },
  );

  r.post(
    "/api/billing/portal",
    requireSession(),
    rateLimitExpress({
      key: "api:billing:portal",
      limit: 10,
      windowMs: 60 * 60 * 1000,
    }),
    async (req: AuthedRequest, res: Response) => {
      // Provider беремо з ВЛАСНОЇ активної підписки юзера (authoritative), а
      // не з geo — інакше legacy Stripe-підписник у UA потрапив би у no-op
      // LiqPay-portal і втратив би доступ до оновлення картки/інвойсів.
      // Fallback на geo лише коли підписки ще нема. `manual` (founder/comp)
      // не має registry-провайдера → теж fallback на geo.
      const { rows } = await pool.query<{ provider: string }>(
        `SELECT provider
           FROM subscriptions
          WHERE user_id = $1 AND status IN ('active', 'trialing', 'past_due')
          ORDER BY updated_at DESC
          LIMIT 1`,
        [req.user!.id],
      );
      const owned = rows[0]?.provider;
      const providerId: ProviderId =
        owned === "stripe" || owned === "liqpay" || owned === "plata"
          ? owned
          : (getEnabledProviders({ country: userCountry(req) })[0] ?? "stripe");
      try {
        const payload = BillingPortalResponseSchema.parse(
          await providerRegistry[providerId].createCustomerPortalSession({
            pool,
            user: { id: req.user!.id, email: req.user!.email ?? null },
          }),
        );
        res.json(payload);
      } catch (err) {
        if (handleBillingError(err, res)) return;
        throw err;
      }
    },
  );

  // Власна кнопка «Скасувати Pro» (LiqPay/Plata не мають Customer Portal).
  r.post(
    "/api/billing/cancel",
    requireSession(),
    rateLimitExpress({
      key: "api:billing:cancel",
      limit: 10,
      windowMs: 60 * 60 * 1000,
    }),
    async (req: AuthedRequest, res: Response) => {
      const userId = req.user!.id;
      // Best-effort по всіх провайдерах (кожен — no-op без своєї підписки).
      // Per-provider try/catch — щоб транзієнтна помилка одного провайдера
      // (LiqPay 5xx, Stripe not-configured на UA-деплої) не валила cancel,
      // який в інших уже пройшов. Той самий патерн, що dataRights +
      // internal/billing (ADR-0016).
      await Promise.all(
        (["stripe", "liqpay", "plata"] as ProviderId[]).map(async (id) => {
          try {
            await providerRegistry[id].cancelSubscription(pool, userId);
          } catch (err) {
            logger.warn({
              msg: "billing_cancel_provider_failed",
              provider: id,
              err: err instanceof Error ? err.message : String(err),
            });
          }
        }),
      );
      res.json(BillingCancelResponseSchema.parse({ ok: true }));
    },
  );

  // ── Webhooks (per-provider; raw body — див. bodySizePolicy) ──────────
  r.post("/api/billing/stripe-webhook", async (req: Request, res: Response) => {
    const raw = rawBody(req);
    const signature =
      typeof req.headers["stripe-signature"] === "string"
        ? req.headers["stripe-signature"]
        : undefined;
    if (!verifyStripeSignature(raw, signature)) {
      emitSecurityEvent({
        event: "stripe_webhook_bad_sig",
        severity: "high",
        details:
          signature === undefined
            ? "stripe signature header missing"
            : "stripe signature mismatch",
      });
      throw new ValidationError("Invalid Stripe signature");
    }
    const event = JSON.parse(raw.toString("utf8")) as {
      id?: unknown;
      type?: unknown;
      data?: unknown;
    };
    if (typeof event.id !== "string" || typeof event.type !== "string") {
      throw new ValidationError("Invalid Stripe event");
    }
    const stripeEvent =
      event.data && typeof event.data === "object"
        ? {
            id: event.id,
            type: event.type,
            data: event.data as { object?: Record<string, unknown> },
          }
        : { id: event.id, type: event.type };
    const result = await processStripeWebhook(pool, stripeEvent, raw);
    res.json(result);
  });

  // LiqPay server callback — form `data` + `signature` (підпис над `data`).
  r.post(
    "/api/billing/liqpay-callback",
    async (req: Request, res: Response) => {
      const params = new URLSearchParams(rawBody(req).toString("utf8"));
      const data = params.get("data");
      const signature = params.get("signature");
      if (
        !data ||
        !signature ||
        !liqpayProvider.verifyWebhookSignature(data, signature)
      ) {
        emitSecurityEvent({
          event: "liqpay_webhook_bad_sig",
          severity: "high",
          details:
            !data || !signature
              ? "liqpay data/signature missing"
              : "liqpay signature mismatch",
        });
        res.status(400).json({ error: "Invalid LiqPay signature" });
        return;
      }
      await liqpayProvider.processWebhook(pool, data);
      res.json({ ok: true });
    },
  );

  // Plata (monopay) webhook — JSON body, `X-Sign` (ECDSA над сирим тілом).
  r.post("/api/billing/plata-webhook", async (req: Request, res: Response) => {
    const raw = rawBody(req).toString("utf8");
    const header = req.headers["x-sign"];
    const signature = Array.isArray(header) ? header[0] : header;
    // Warm pubkey перед verify; на mismatch — рефетч (rotation) і одна повторна спроба.
    await ensurePlataPubkey();
    let ok =
      typeof signature === "string" &&
      plataProvider.verifyWebhookSignature(raw, signature);
    if (!ok && typeof signature === "string") {
      await ensurePlataPubkey(true);
      ok = plataProvider.verifyWebhookSignature(raw, signature);
    }
    if (!ok) {
      emitSecurityEvent({
        event: "plata_webhook_bad_sig",
        severity: "high",
        details:
          signature === undefined
            ? "plata X-Sign missing"
            : "plata signature mismatch",
      });
      res.status(400).json({ error: "Invalid Plata signature" });
      return;
    }
    await plataProvider.processWebhook(pool, raw);
    res.json({ ok: true });
  });

  return r;
}
