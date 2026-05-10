/**
 * `usePlanTemplate` — mobile hook for the Fizruk **Plan template** slot
 * (a single reusable schedule the monthly-plan screen can stamp onto
 * arbitrary date ranges).
 *
 * Persists under `STORAGE_KEYS.FIZRUK_PLAN_TEMPLATE`
 * (`fizruk_plan_template_v1`). The slot stores a single object (or
 * `null` when no template is set).
 *
 * `setPlanTemplate(next)` is no-op-guarded by deep equality (same
 * `JSON.stringify` pattern used by `routine-domain` `applyUpdateHabit`,
 * see Task #5): if `next` round-trips to the same JSON as the current
 * value, the in-memory state stays referentially identical and the
 * MMKV write is skipped. This keeps the slot stable on idempotent
 * re-saves of the same form.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";
import { triggerFizrukDualWrite } from "../lib/dualWrite";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractPlanTemplateSnapshot,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";

const STORAGE_KEY = STORAGE_KEYS.FIZRUK_PLAN_TEMPLATE;

export interface PlanTemplate {
  id?: string;
  name?: string;
  /** `{ "0": "tmpl-id", "1": null, ... }` — weekday → template id. */
  weekday?: Record<string, string | null>;
  /** Free-form notes the user attaches to the template. */
  notes?: string;
  updatedAt?: string;
  [extra: string]: unknown;
}

function readPlan(): PlanTemplate | null {
  const raw = safeReadLS<unknown>(STORAGE_KEY, null);
  if (raw && typeof raw === "object") return raw as PlanTemplate;
  return null;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export interface UsePlanTemplateResult {
  planTemplate: PlanTemplate | null;
  /**
   * Replace the slot. Pass `null` to clear it. Returns `true` if the
   * slot actually changed (and was persisted), `false` for a no-op
   * write.
   */
  setPlanTemplate(next: PlanTemplate | null): boolean;
  /** Convenience for `setPlanTemplate(null)`. */
  clearPlanTemplate(): boolean;
}

export function usePlanTemplate(): UsePlanTemplateResult {
  const [plan, setPlan] = useState<PlanTemplate | null>(readPlan);
  // See `useFizrukWorkouts` for why we mirror state in a ref.
  const stateRef = useRef<PlanTemplate | null>(plan);

  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey !== STORAGE_KEY) return;
      const fresh = readPlan();
      stateRef.current = fresh;
      setPlan(fresh);
    });
    return () => sub.remove();
  }, []);

  const setPlanTemplate = useCallback<UsePlanTemplateResult["setPlanTemplate"]>(
    (next) => {
      const prev = stateRef.current;
      if (deepEqual(prev, next)) return false;
      stateRef.current = next;
      // Mirror the convention used by `useActiveFizrukWorkout` when
      // clearing — write `null` rather than removing the key, so the
      // cross-source listener still fires consistently.
      safeWriteLS(STORAGE_KEY, next);
      setPlan(next);
      // Stage 12.5 / PR #070f2-mobile-dualwrite — mirror to SQLite.
      const baseState =
        peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
      triggerFizrukDualWrite(
        { ...baseState, planTemplate: extractPlanTemplateSnapshot(prev) },
        { ...baseState, planTemplate: extractPlanTemplateSnapshot(next) },
      );
      return true;
    },
    [],
  );

  const clearPlanTemplate = useCallback<
    UsePlanTemplateResult["clearPlanTemplate"]
  >(() => setPlanTemplate(null), [setPlanTemplate]);

  return { planTemplate: plan, setPlanTemplate, clearPlanTemplate };
}
