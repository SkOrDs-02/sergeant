import type { BillingPlan } from "@sergeant/shared";

export interface EffectiveLimits {
  aiRequestsPerDay: number | null;
  /**
   * Pro fair-use monthly AI-message cap (ADR-0051 amendment / ADR-0060).
   *
   * `null` = no cap declared in code. The *operative* number is read at runtime
   * from env `AI_MONTHLY_PRO_LIMIT` (see `modules/chat/aiQuota.ts → monthlyProLimit`)
   * so the owner can tune it on Railway after a real cost measurement without a
   * code deploy. This field is the typed extension point + documented default,
   * deliberately `null` so Pro stays unlimited until the env lever is set.
   *
   * Enforced on a Kyiv-month window (not per-day) to preserve the "unlimited"
   * feel within any single day. Free plan is already day-capped, so it carries
   * `null` here.
   */
  aiRequestsPerMonth: number | null;
  cloudSyncDevices: number | null;
  monoAutoSync: boolean;
}

const FREE_LIMITS: EffectiveLimits = {
  aiRequestsPerDay: 5,
  aiRequestsPerMonth: null,
  cloudSyncDevices: 0,
  monoAutoSync: false,
};

const PRO_LIMITS: EffectiveLimits = {
  aiRequestsPerDay: null,
  aiRequestsPerMonth: null,
  cloudSyncDevices: null,
  monoAutoSync: true,
};

export function effectiveLimits(plan: BillingPlan | "free"): EffectiveLimits {
  return plan === "pro" ? PRO_LIMITS : FREE_LIMITS;
}
