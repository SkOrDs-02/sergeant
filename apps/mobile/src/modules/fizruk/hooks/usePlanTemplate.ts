/**
 * `usePlanTemplate` — mobile hook for the Fizruk **Plan template** slot
 * (a single reusable schedule the monthly-plan screen can stamp onto
 * arbitrary date ranges).
 *
 * Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5 of
 * `docs/planning/storage-roadmap.md`. Reads from the SQLite warm cache
 * (`getCachedFizrukSqliteState`) and persists exclusively through the
 * dual-write pipeline (`triggerFizrukDualWrite`). The legacy MMKV slot
 * `STORAGE_KEYS.FIZRUK_PLAN_TEMPLATE` is drained on first boot via
 * `importFizrukResidualFromMmkv` and removed.
 *
 * `setPlanTemplate(next)` is no-op-guarded by deep equality (same
 * `JSON.stringify` pattern used by `routine-domain` `applyUpdateHabit`):
 * if `next` round-trips to the same JSON as the current value, the
 * in-memory state stays referentially identical and the dual-write
 * trigger is skipped. This keeps the slot stable on idempotent
 * re-saves of the same form.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { triggerFizrukDualWrite } from "../lib/dualWrite";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractPlanTemplateSnapshot,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

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

/**
 * Project the cached plan-template singleton onto the hook shape.
 * `null` (= "no row yet") and the JSON literal `'null'` both collapse
 * onto `null`. Malformed JSON / non-object payloads collapse onto
 * `null` so the hook never surfaces invalid data.
 */
function projectFromCache(
  row: { dataJson: string } | null,
): PlanTemplate | null {
  if (row === null) return null;
  try {
    const parsed = JSON.parse(row.dataJson);
    if (parsed && typeof parsed === "object") return parsed as PlanTemplate;
    return null;
  } catch {
    return null;
  }
}

/** Read the initial state from the warm cache, or `null` if cold. */
function loadInitialPlan(): PlanTemplate | null {
  const cache = getCachedFizrukSqliteState();
  if (cache.refreshedAt === null) return null;
  return projectFromCache(cache.planTemplate);
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
  const [plan, setPlan] = useState<PlanTemplate | null>(loadInitialPlan);
  // Mirror state in a ref so the imperative setter sees the latest
  // cache-derived state without a stale closure.
  const stateRef = useRef<PlanTemplate | null>(plan);

  // Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5: overlay the
  // plan-template singleton from the SQLite warm cache once it's
  // available.
  const sqliteCacheTick = useFizrukSqliteReadTick();
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    const overlay = projectFromCache(cache.planTemplate);
    stateRef.current = overlay;
    setPlan(overlay);
  }, [sqliteCacheTick]);

  const setPlanTemplate = useCallback<UsePlanTemplateResult["setPlanTemplate"]>(
    (next) => {
      const prev = stateRef.current;
      if (deepEqual(prev, next)) return false;
      stateRef.current = next;
      setPlan(next);
      // Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5 — mirror to
      // SQLite via the dual-write pipeline only (no MMKV write).
      const baseState =
        peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
      try {
        triggerFizrukDualWrite(
          { ...baseState, planTemplate: extractPlanTemplateSnapshot(prev) },
          { ...baseState, planTemplate: extractPlanTemplateSnapshot(next) },
        );
      } catch {
        /* trigger is fire-and-forget — never propagate */
      }
      return true;
    },
    [],
  );

  const clearPlanTemplate = useCallback<
    UsePlanTemplateResult["clearPlanTemplate"]
  >(() => setPlanTemplate(null), [setPlanTemplate]);

  return { planTemplate: plan, setPlanTemplate, clearPlanTemplate };
}
