import { Router } from "express";
import type { Request, Response } from "express";
import type { Pool } from "pg";
import {
  BillingCheckoutRequestSchema,
  BillingCheckoutResponseSchema,
  BillingStatusResponseSchema,
} from "@sergeant/shared";
import {
  asyncHandler,
  rateLimitExpress,
  requireSession,
  setModule,
  validateBody,
} from "../http/index.js";
import {
  BillingConfigurationError,
  createCheckoutSession,
  getSubscriptionStatus,
  processStripeWebhook,
  verifyStripeSignature,
} from "../modules/billing/stripe.js";

type AuthedRequest = Request & {
  user?: { id: string; email?: string | null };
};

function rawBody(req: Request): Buffer {
  return Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
}

export function createBillingRouter({ pool }: { pool: Pool }): Router {
  const r = Router();
  r.use("/api/billing", setModule("billing"));

  r.post(
    "/api/billing/checkout",
    requireSession(),
    rateLimitExpress({
      key: "api:billing:checkout",
      limit: 10,
      windowMs: 60 * 60 * 1000,
    }),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const parsed = validateBody(BillingCheckoutRequestSchema, req, res);
      if (!parsed.ok) return;

      try {
        const payload = BillingCheckoutResponseSchema.parse(
          await createCheckoutSession({
            pool,
            user: {
              id: req.user!.id,
              email: req.user!.email ?? null,
            },
            plan: parsed.data.plan,
          }),
        );
        res.json(payload);
      } catch (err) {
        if (err instanceof BillingConfigurationError) {
          res.status(503).json({
            error: "Billing is not configured",
            code: "BILLING_UNAVAILABLE",
          });
          return;
        }
        throw err;
      }
    }),
  );

  r.get(
    "/api/billing/status",
    requireSession(),
    asyncHandler(async (req: AuthedRequest, res: Response) => {
      const payload = BillingStatusResponseSchema.parse(
        await getSubscriptionStatus(pool, req.user!.id),
      );
      res.json(payload);
    }),
  );

  r.post(
    "/api/billing/stripe-webhook",
    asyncHandler(async (req: Request, res: Response) => {
      const raw = rawBody(req);
      const signature =
        typeof req.headers["stripe-signature"] === "string"
          ? req.headers["stripe-signature"]
          : undefined;
      if (!verifyStripeSignature(raw, signature)) {
        res.status(400).json({ error: "Invalid Stripe signature" });
        return;
      }

      const event = JSON.parse(raw.toString("utf8")) as {
        id?: unknown;
        type?: unknown;
        data?: unknown;
      };
      if (typeof event.id !== "string" || typeof event.type !== "string") {
        res.status(400).json({ error: "Invalid Stripe event" });
        return;
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
    }),
  );

  return r;
}
