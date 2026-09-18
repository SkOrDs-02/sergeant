/**
 * Monthly-plan singleton diff for the Fizruk dual-write layer
 * (Stage 12 / PR #070f-mobile-dualwrite). Per-shape module-folder
 * split from the monolithic `diff.ts` — see
 * `docs/audits/2026-05-13-mobile-reliability-ux-roast.md` § P2.2a.
 *
 * The whole document is serialised to a JSON string so the diff can
 * compare two planforms by byte-equality. The adapter writes
 * `dataJson` straight into `fizruk_monthly_plan.data_json`. The
 * hook never deletes the singleton — clearing days resets the
 * document but keeps the slot, so `null` on `next` is a no-op.
 */

export interface FizrukMonthlyPlanSnapshot {
  readonly dataJson: string;
}

export interface MonthlyPlanSetOp {
  readonly kind: "monthly-plan-set";
  readonly monthlyPlan: FizrukMonthlyPlanSnapshot;
}

export type MonthlyPlanOp = MonthlyPlanSetOp;

export function diffMonthlyPlanOps(
  prev: FizrukMonthlyPlanSnapshot | null | undefined,
  next: FizrukMonthlyPlanSnapshot | null | undefined,
): MonthlyPlanOp[] {
  const prevPlan = prev ?? null;
  const nextPlan = next ?? null;
  if (prevPlan === nextPlan) return [];
  if (nextPlan === null) {
    // The hook never deletes the singleton — clearing days resets
    // the document but keeps the slot. If a caller sets
    // `monthlyPlan = null` we no-op rather than emit a delete (the
    // `fizruk_monthly_plan` table has no soft-delete column).
    return [];
  }
  if (prevPlan && prevPlan.dataJson === nextPlan.dataJson) return [];
  return [{ kind: "monthly-plan-set", monthlyPlan: nextPlan }];
}
