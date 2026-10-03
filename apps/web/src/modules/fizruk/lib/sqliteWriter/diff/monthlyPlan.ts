/**
 * Monthly-plan singleton diff for the Fizruk dual-write layer
 * (Stage 12 / PR #070f-dualwrite).
 *
 * The whole `MonthlyPlanState` document is serialized to JSON (`data_json`)
 * — there is no per-day normalisation in `fizruk_monthly_plan`.
 */

export interface FizrukMonthlyPlanSnapshot {
  /** Whole MonthlyPlan document serialized to JSON for `data_json`. */
  readonly dataJson: string;
}

export interface MonthlyPlanSetOp {
  readonly kind: "monthly-plan-set";
  readonly monthlyPlan: FizrukMonthlyPlanSnapshot;
}

export function diffMonthlyPlanOps(
  prev: FizrukMonthlyPlanSnapshot | null | undefined,
  next: FizrukMonthlyPlanSnapshot | null | undefined,
): MonthlyPlanSetOp[] {
  const prevPlan = prev ?? null;
  const nextPlan = next ?? null;
  if (prevPlan === nextPlan) return [];
  if (nextPlan === null) {
    // The hook never deletes the singleton — clearing days resets the
    // document but keeps the slot. Still, if a caller sets `monthlyPlan
    // = null` we no-op rather than emit a delete op (the table has no
    // soft-delete column).
    return [];
  }
  if (prevPlan && prevPlan.dataJson === nextPlan.dataJson) return [];
  return [{ kind: "monthly-plan-set", monthlyPlan: nextPlan }];
}
