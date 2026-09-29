import { useCallback, useState } from "react";
import {
  FEATURES,
  hasFeature,
  type PaywallSurface,
  type PaywalledFeatureId,
} from "@sergeant/shared";
import { usePlan } from "./usePlan";

/**
 * Premium feature gate за реєстром доступу (`@sergeant/shared` `FEATURES`,
 * спека `docs/work/specs/access-tiers.md`).
 *
 * Доступ читається зі знімка `/api/billing/status` (`access.features` і
 * `access.meters`), а не виводиться з плану тут: під час trial і grace два
 * місця обчислення розійшлися б. Квотна фіча (фото, vision-скан) закрита,
 * коли її тижневий лічильник вичерпано. Поки знімка немає, діє правило Free
 * з реєстру: сервер однаково гейтить сам, а 402/429 відкривають пейвол
 * через `openPaywall`.
 */

export type { PaywalledFeatureId };

export interface UseFeatureGateResult {
  /** True коли фіча відкрита і (для квотних) лічильник не вичерпано. */
  canAccess: boolean;
  /**
   * Side-effecting check. Returns `true` if the feature is open (call-site
   * proceeds), otherwise opens the paywall and returns `false`.
   */
  requireAccess: () => boolean;
  /** Відкрити пейвол після 402/429 від сервера (знімок міг застаріти). */
  openPaywall: () => void;
  /** Bind to `<PaywallModal open>`. */
  paywallOpen: boolean;
  /** Bind to `<PaywallModal surface>`. */
  paywallSurface: PaywallSurface;
  /** Stable id of the gated feature for copy lookup. */
  featureId: PaywalledFeatureId;
  /** Close handler — bind to `<PaywallModal onClose>`. */
  closePaywall: () => void;
}

export function useFeatureGate(
  feature: PaywalledFeatureId,
): UseFeatureGateResult {
  const { access } = usePlan();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const spec = FEATURES[feature];

  const open = access
    ? access.features[feature] === true
    : hasFeature("free", feature);
  const meter =
    access && "meter" in spec ? access.meters[spec.meter] : undefined;
  const exhausted = meter?.limit != null && meter.used >= meter.limit;
  const canAccess = open && !exhausted;

  const requireAccess = useCallback(() => {
    if (canAccess) return true;
    setPaywallOpen(true);
    return false;
  }, [canAccess]);

  const openPaywall = useCallback(() => setPaywallOpen(true), []);
  const closePaywall = useCallback(() => setPaywallOpen(false), []);

  return {
    canAccess,
    requireAccess,
    openPaywall,
    paywallOpen,
    paywallSurface: spec.surface,
    featureId: feature,
    closePaywall,
  };
}
