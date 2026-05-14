/**
 * Plan-template singleton diff for the Fizruk dual-write layer
 * (Stage 12.5 / PR #070f2-mobile-dualwrite). Per-shape
 * module-folder split from the monolithic `diff.ts` — see
 * `docs/audits/2026-05-13-mobile-reliability-ux-roast.md` § P2.2a.
 *
 * The whole document (or `null` when the slot is empty) is
 * serialised to a JSON string so the diff can compare two payloads
 * by byte-equality. `null` on `next` ≡ cold cache (no-op); the hook
 * emits an explicit `dataJson === 'null'` payload when clearing the
 * slot, which round-trips through `fizruk_plan_templates.data_json`
 * (default `'null'`) without triggering a delete op.
 */

export interface FizrukPlanTemplateSnapshot {
  readonly dataJson: string;
}

export interface PlanTemplateSetOp {
  readonly kind: "plan-template-set";
  readonly planTemplate: FizrukPlanTemplateSnapshot;
}

export type PlanTemplateOp = PlanTemplateSetOp;

export function diffPlanTemplateOps(
  prev: FizrukPlanTemplateSnapshot | null | undefined,
  next: FizrukPlanTemplateSnapshot | null | undefined,
): PlanTemplateOp[] {
  const prevPlan = prev ?? null;
  const nextPlan = next ?? null;
  if (nextPlan === null) return [];
  if (prevPlan && prevPlan.dataJson === nextPlan.dataJson) return [];
  return [{ kind: "plan-template-set", planTemplate: nextPlan }];
}
