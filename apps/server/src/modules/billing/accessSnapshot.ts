import type { Pool } from "pg";
import {
  FEATURE_IDS,
  hasFeature,
  nextWeekStartKyivMs,
  weeklyLimit,
  type BillingAccess,
  type BillingMeter,
  type FeatureId,
} from "@sergeant/shared";
import { getWeeklyUsage } from "../chat/aiQuota.js";
import { accessStateOf, getUserPlan } from "./getUserPlan.js";

/**
 * Знімок доступу для `GET /api/billing/status` (спека
 * `docs/work/specs/access-tiers.md`). Web нічого не обчислює з плану сам,
 * лише читає цей обʼєкт; `/pricing` бере ті самі правила з реєстру.
 * Founder проходить через `getUserPlan` (синтетичний Pro) і отримує `pro`.
 */
export async function buildAccessSnapshot(
  pool: Pool,
  userId: string,
  now: Date = new Date(),
): Promise<BillingAccess> {
  const plan = await getUserPlan(pool, userId);
  const state = accessStateOf(plan, now);
  const tier = state === "free" ? "free" : "pro";
  const usage = await getWeeklyUsage(userId);
  const resetsAt = new Date(nextWeekStartKyivMs(now)).toISOString();
  const meter = (used: number, feature: FeatureId): BillingMeter => ({
    used,
    limit: weeklyLimit(tier, feature),
    resetsAt,
  });

  return {
    state,
    trialEndsAt:
      state === "trial" ? (plan.currentPeriodEnd?.toISOString() ?? null) : null,
    graceEndsAt:
      state === "grace" ? (plan.graceEndsAt?.toISOString() ?? null) : null,
    features: Object.fromEntries(
      FEATURE_IDS.map((id) => [id, hasFeature(tier, id)]),
    ),
    meters: {
      aiActions: meter(usage.ai, "ai.actions"),
      aiPhoto: meter(usage.photo, "ai.photo"),
      finykVision: meter(usage["finyk-vision"], "ai.finykVision"),
    },
  };
}
