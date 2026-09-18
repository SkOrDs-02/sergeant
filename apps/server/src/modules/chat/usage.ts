import type { Request, Response } from "express";
import pool from "../../db.js";
import { getUserPlan } from "../billing/getUserPlan.js";
import { effectiveLimits } from "../billing/effectiveLimits.js";
import { getTodayChatUsage } from "./aiQuota.js";
import { ChatUsageResponseSchema } from "@sergeant/shared";

type AuthedRequest = Request & { user?: { id: string } };

/**
 * GET /api/chat/usage — today's Free-tier AI chat quota (PR-42 chat counter).
 * Router wires `requireSession()` first, so `req.user` is always set here.
 * Pro (or any plan with `aiRequestsPerDay: null`) → `limit`/`remaining: null`;
 * the frontend counter pill hides itself in that case instead of showing
 * "∞/∞".
 */
export default async function chatUsageHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as AuthedRequest).user!.id;
  const plan = (await getUserPlan(pool, userId)).plan;
  const limit = effectiveLimits(plan).aiRequestsPerDay;
  if (limit == null) {
    res.json(
      ChatUsageResponseSchema.parse({ plan, limit: null, remaining: null }),
    );
    return;
  }
  const used = await getTodayChatUsage(userId);
  res.json(
    ChatUsageResponseSchema.parse({
      plan,
      limit,
      remaining: Math.max(0, limit - used),
    }),
  );
}
