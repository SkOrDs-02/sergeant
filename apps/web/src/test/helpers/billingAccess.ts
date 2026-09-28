import type { BillingAccess } from "@sergeant/shared";
import { FEATURE_IDS, hasFeature } from "@sergeant/shared";

const RESETS_AT = "2026-06-14T21:00:00.000Z";

/**
 * Знімок доступу `/api/billing/status` для тестів: фічі й ліміти з реєстру
 * `@sergeant/shared`, щоб фікстура не стала четвертою копією пакетування.
 */
export function accessFixture(
  state: BillingAccess["state"] = "free",
  extra: Partial<BillingAccess> = {},
): BillingAccess {
  const tier = state === "free" ? "free" : "pro";
  const limit = (n: number) => (tier === "free" ? n : null);
  return {
    state,
    trialEndsAt: null,
    graceEndsAt: null,
    features: Object.fromEntries(
      FEATURE_IDS.map((id) => [id, hasFeature(tier, id)]),
    ),
    meters: {
      aiActions: { used: 0, limit: limit(20), resetsAt: RESETS_AT },
      aiPhoto: { used: 0, limit: limit(3), resetsAt: RESETS_AT },
      finykVision: { used: 0, limit: limit(5), resetsAt: RESETS_AT },
    },
    ...extra,
  };
}
