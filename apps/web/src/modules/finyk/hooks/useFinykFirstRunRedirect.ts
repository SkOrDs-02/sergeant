import { useEffect, useRef } from "react";
import type { FinykPage } from "../lib/finykRouter";

export interface UseFinykFirstRunRedirectArgs {
  enabled: boolean;
  pwaAction: string | null | undefined;
  page: FinykPage;
  navigate: (p: FinykPage | string) => void;
}

/**
 * One-shot first-run jump to the canonical «Планування» (budgets)
 * landing surface. Skipped when a `pwaAction` is already routing
 * the user (the action target wins).
 *
 * The hook fires at most once per mount. Subsequent toggles of
 * `enabled` (e.g. cross-tab edit to the seen flag) are ignored on
 * purpose — `MonthlyPlanCard` reads its first-run hint prop on its
 * first mount only.
 */
export function useFinykFirstRunRedirect({
  enabled,
  pwaAction,
  page,
  navigate,
}: UseFinykFirstRunRedirectArgs): void {
  const firedRef = useRef(false);
  const navRef = useRef(navigate);
  navRef.current = navigate;

  useEffect(() => {
    if (firedRef.current) return;
    if (!enabled) return;
    if (pwaAction === "add_expense") return;
    if (page !== "budgets") {
      firedRef.current = true;
      navRef.current("budgets");
    }
  }, [enabled, pwaAction, page]);
}
