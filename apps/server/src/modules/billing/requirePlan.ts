import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Pool } from "pg";
import type { BillingPlan } from "@sergeant/shared";
import { getUserPlan, isFounderUser } from "./getUserPlan.js";
import { isBillingEnforced } from "./provider.js";

type AuthedRequest = Request & { user?: { id: string } };

/**
 * Express middleware that gates a route behind an active Pro subscription.
 * Returns 402 Payment Required when the user is on the free plan.
 *
 * Bypassed лише коли НЕ увімкнено жодного платіжного провайдера
 * ({@link isBillingEnforced}) — тобто білінг ще не запущено. Прив'язка саме
 * до `STRIPE_ENABLED` була багом: у проді Stripe dormant, а гроші приймають
 * LiqPay і Plata, тож цей early-return роздавав Pro безкоштовно на всіх
 * чотирьох захищених роутах (`ai-memory`, `transcribe`, `nutrition` x2).
 * Прапорці парсяться строго Zod-схемою (audit 2026-06-11 ws-08): друкарська
 * помилка валить boot замість тихо вимкнути монетизацію, а
 * `STRIPE_ENABLED=true` без `STRIPE_SECRET_KEY` не дає стартувати.
 *
 * Founders (`AI_QUOTA_FOUNDER_IDS`) bypass the paywall regardless of their
 * billing plan — mirrors the AI-quota founder bypass so internal accounts can
 * dogfood Pro-only surfaces without a `subscriptions` row.
 */
export function requirePlan(
  pool: Pool,
  requiredPlan: BillingPlan = "pro",
): RequestHandler {
  return async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!isBillingEnforced()) {
      next();
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (isFounderUser(userId)) {
      next();
      return;
    }

    const planResult = await getUserPlan(pool, userId);
    const isActive = ["active", "trialing", "past_due"].includes(
      planResult.status,
    );

    if (requiredPlan === "pro" && planResult.plan === "pro" && isActive) {
      next();
      return;
    }

    res.status(402).json({
      error: "Pro subscription required",
      code: "PLAN_REQUIRED",
      requiredPlan,
    });
  };
}
