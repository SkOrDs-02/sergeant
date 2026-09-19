import { useCallback, useState } from "react";
import { usePlan } from "./usePlan";
import type { PaywallSurface } from "./PaywallModal";
import {
  FEATURE_TO_SURFACE,
  PREMIUM_FEATURE_IDS,
  type PremiumFeatureId,
} from "./premiumFeatures";

/**
 * Premium feature gate (initiative Phase 7 D2 / `docs/design/redesign-v2/
 * phase-7-product-decisions-2026-05-22.md` § D2).
 *
 * Single-tier model locked in D3: Free → Premium. A premium-only call-site
 * wraps its user-triggered action with `requireAccess()`. If the user is
 * not on Pro, the call-site receives `false`, opens the paywall, and is
 * expected to short-circuit the underlying action. The hook owns
 * paywall-open state per call-site so consumers do not need to thread
 * an extra `useState` boolean.
 *
 * Conservative 3-5 starter gates land in this PR; the inventory will
 * grow as more premium-only surfaces ship. Usage thresholds and
 * time-based triggers are explicitly deferred per D2.
 */

// AI-NOTE: `"multi-currency"` прибрано 2026-08-05 (B3 браузерного аудиту) —
// гейт не викликався з жодного call-site, а функції, яку він нібито
// захищав, у застосунку немає: у формі активу валюта статична («UAH»)
// однаково для Free і Premium. Осиротілу копію `paywall["multi-currency"]`
// прибрано з `uk.ts` і `en.ts` 2026-09-16 (борг дизайн-контракту тарифів),
// а сам реєстр гейтів переїхав у leaf-модуль `premiumFeatures.ts`, щоб
// контрактний тест каталогів деривував список, а не тримав його копію.
export type { PremiumFeatureId };
export { PREMIUM_FEATURE_IDS };

export interface UseFeatureGateResult {
  /** True when the user is on Pro and the gated feature is unlocked. */
  canAccess: boolean;
  /**
   * Side-effecting check. Returns `true` if the user is on Pro
   * (call-site proceeds), otherwise opens the paywall and returns
   * `false` (call-site short-circuits).
   */
  requireAccess: () => boolean;
  /** Bind to `<PaywallModal open>`. */
  paywallOpen: boolean;
  /** Bind to `<PaywallModal surface>`. */
  paywallSurface: PaywallSurface;
  /** Stable id of the gated feature for copy lookup. */
  featureId: PremiumFeatureId;
  /** Close handler — bind to `<PaywallModal onClose>`. */
  closePaywall: () => void;
}

export function useFeatureGate(
  feature: PremiumFeatureId,
): UseFeatureGateResult {
  const { isPro } = usePlan();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const requireAccess = useCallback(() => {
    if (isPro) return true;
    setPaywallOpen(true);
    return false;
  }, [isPro]);

  const closePaywall = useCallback(() => setPaywallOpen(false), []);

  return {
    canAccess: isPro,
    requireAccess,
    paywallOpen,
    paywallSurface: FEATURE_TO_SURFACE[feature],
    featureId: feature,
    closePaywall,
  };
}
