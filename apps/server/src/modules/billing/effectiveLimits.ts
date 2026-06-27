import type { BillingPlan } from "@sergeant/shared";

export interface EffectiveLimits {
  aiRequestsPerDay: number | null;
  cloudSyncDevices: number | null;
  monoAutoSync: boolean;
}

const FREE_LIMITS: EffectiveLimits = {
  aiRequestsPerDay: 15,
  cloudSyncDevices: 2,
  monoAutoSync: false,
};

const PRO_LIMITS: EffectiveLimits = {
  aiRequestsPerDay: null,
  cloudSyncDevices: null,
  monoAutoSync: true,
};

export function effectiveLimits(plan: BillingPlan | "free"): EffectiveLimits {
  return plan === "pro" ? PRO_LIMITS : FREE_LIMITS;
}
