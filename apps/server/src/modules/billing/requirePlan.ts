import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Pool } from "pg";
import type { BillingPlan } from "@sergeant/shared";
import { env } from "../../env/env.js";
import { getUserPlan, isFounderUser } from "./getUserPlan.js";

type AuthedRequest = Request & { user?: { id: string } };

/**
 * Express middleware that gates a route behind an active Pro subscription.
 * Returns 402 Payment Required when the user is on the free plan.
 *
 * Bypassed while `STRIPE_ENABLED` is off — lets production run without
 * enforcing paywalls until live billing is activated. The flag is parsed
 * strictly by the Zod env schema (audit 2026-06-11 ws-08): a typo fails the
 * boot instead of silently disabling monetization, and
 * `STRIPE_ENABLED=true` without `STRIPE_SECRET_KEY` refuses to start.
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
    if (!env.STRIPE_ENABLED) {
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
