import type { Request, Response } from "express";
import { weeklyLimit, ChatUsageResponseSchema } from "@sergeant/shared";
import pool from "../../db.js";
import { getUserPlan } from "../billing/getUserPlan.js";
import { getWeeklyUsage } from "./aiQuota.js";

type AuthedRequest = Request & { user?: { id: string } };

/**
 * GET /api/chat/usage: this week's Free-tier AI actions (`ai.actions` in the
 * access registry). Router wires `requireSession()` first, so `req.user` is
 * always set here. Premium (incl. trial and grace) → `limit`/`remaining: null`.
 */
export default async function chatUsageHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as AuthedRequest).user!.id;
  const plan = (await getUserPlan(pool, userId)).plan;
  const limit = weeklyLimit(plan, "ai.actions");
  if (limit == null) {
    res.json(
      ChatUsageResponseSchema.parse({ plan, limit: null, remaining: null }),
    );
    return;
  }
  const used = (await getWeeklyUsage(userId)).ai;
  res.json(
    ChatUsageResponseSchema.parse({
      plan,
      limit,
      remaining: Math.max(0, limit - used),
    }),
  );
}
