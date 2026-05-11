import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Pool } from "pg";
import type { BillingPlan } from "@sergeant/shared";
import { getUserPlan } from "./getUserPlan.js";

type AuthedRequest = Request & { user?: { id: string } };

/**
 * Express middleware that gates a route behind an active Pro subscription.
 * Returns 402 Payment Required when the user is on the free plan.
 *
 * Bypassed when STRIPE_ENABLED is not "true" — lets production run without
 * enforcing paywalls until live billing is activated.
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
    if (process.env["STRIPE_ENABLED"] !== "true") {
      next();
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
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
