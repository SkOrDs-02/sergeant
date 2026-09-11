/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * `useCanUse()` — один pre-gate на всі серверні фічі.
 *
 * Віддає функцію, яка на кожну поверхню відповідає `AccessDenial | null`:
 * `null` означає «можна», решта — назва причини, з якої дію не можна
 * СТАРТУВАТИ. Логіка причин живе в `featureAccess.ts` (чиста, тестована
 * без React); тут лише підключення до живого стану.
 *
 * Використання — у самому call-site дії, до `mutate()`:
 *
 * ```ts
 * const canUse = useCanUse();
 * const fetchWeekPlan = useCallback(() => {
 *   const denial = canUse("week-plan");
 *   if (denial) return setDenial(denial);
 *   weekPlanMutation.mutate();
 * }, [canUse, setDenial, weekPlanMutation]);
 * ```
 */
import { useCallback } from "react";

import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import type { AccessDenial } from "@shared/lib/api/accessDenial";

import { useHasAccount } from "../auth/useHasAccount";
import { resolveFeatureDenial, type GatedFeature } from "./featureAccess";

export function useCanUse(): (feature: GatedFeature) => AccessDenial | null {
  const hasAccount = useHasAccount();
  const online = useOnlineStatus();

  return useCallback(
    (feature: GatedFeature) =>
      resolveFeatureDenial(feature, { hasAccount, online }),
    [hasAccount, online],
  );
}

/**
 * Той самий pre-gate, але у формі, яка не множить `if` по call-site-ах.
 *
 * `guard("week-plan", () => mutation.mutate())` — дія стартує лише коли
 * причини відмови немає; інакше причина йде в `onDenied` і запит не
 * відбувається взагалі. Саме «взагалі» тут і є суть: до цієї поставки
 * шість поверхонь стартували запит і показували 401 уже ПІСЛЯ того, як
 * людина вклала в дію роботу.
 */
export function useAccessGuard(
  onDenied: (denial: AccessDenial) => void,
): (feature: GatedFeature, run: () => void) => void {
  const canUse = useCanUse();
  return useCallback(
    (feature, run) => {
      const denial = canUse(feature);
      if (denial) {
        onDenied(denial);
        return;
      }
      run();
    },
    [canUse, onDenied],
  );
}
