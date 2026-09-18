import type { BillingPlan } from "@sergeant/shared";

export interface EffectiveLimits {
  aiRequestsPerDay: number | null;
  cloudSyncDevices: number | null;
  monoAutoSync: boolean;
}

// AI-CONTEXT: `aiRequestsPerDay` для Free — рішення ADR-0085 (уточнює один
// рядок ADR-0068 після виміру unit-економіки). Число вже дрейфувало між
// кодом і governance-документом; зміна — новим ADR, не правкою тут.
const FREE_LIMITS: EffectiveLimits = {
  aiRequestsPerDay: 5,
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
