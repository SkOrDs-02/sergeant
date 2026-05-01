/**
 * Hub dashboard — quick-stats preview selector (pure domain).
 *
 * The Hub dashboard renders a one-line preview next to each module
 * label in the Status row: a `main` figure (e.g. "1 250 грн"), a
 * `sub` caption (e.g. "Залишок: 7 300") and, for modules with a
 * daily goal, a `progress` percentage (0–100).
 *
 * The raw payloads are persisted per-module as JSON strings under the
 * `*_quick_stats` keys (`STORAGE_KEYS.FINYK_QUICK_STATS`, etc.). Web
 * reads `localStorage`, mobile reads MMKV. Both consume the same JSON
 * schema and therefore the same selector lives here, in
 * `@sergeant/shared`, so UI-layer code on either platform just does:
 *
 * ```ts
 * const preview = selectModulePreview("finyk", rawJson);
 * ```
 *
 * The helpers are DOM-free: storage I/O is the caller's
 * responsibility. Malformed JSON, wrong types and missing fields all
 * resolve to the neutral `{ main: null, sub: null }` shape so the UI
 * can render a dash without guarding every case inline.
 */

import { formatMoney } from "./formatMoney";

export const QUICK_STATS_MODULE_IDS = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
] as const;

export type QuickStatsModuleId = (typeof QUICK_STATS_MODULE_IDS)[number];

export interface ModulePreview {
  /** Primary figure rendered bold-right in the Status row. */
  readonly main: string | null;
  /** Secondary caption rendered under / next to `main`. */
  readonly sub: string | null;
  /** 0–100 completion percentage; only populated for goal-bearing modules. */
  readonly progress?: number;
}

const EMPTY: ModulePreview = { main: null, sub: null };
const EMPTY_WITH_PROGRESS: ModulePreview = {
  main: null,
  sub: null,
  progress: 0,
};

/**
 * Parse a raw quick-stats JSON string. Returns `null` on malformed
 * JSON, non-object payloads (including `null` / arrays / primitives)
 * and missing input. Accepting `null` / `undefined` input lets
 * platform wrappers pass straight through the result of a storage
 * read without a guard.
 */
export function parseQuickStatsJson(
  raw: string | null | undefined,
): Record<string, unknown> | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Select the preview shape for a given module from a raw JSON
 * payload. Implements the web truthiness rules 1:1 so no row on
 * either platform drifts:
 *
 *  - Every numeric field passes through a truthy check — `0` is
 *    rendered as "no meaningful number yet" (`null`), matching the
 *    original `stats.todaySpent ? …` semantics in the web source.
 *  - `routine` and `nutrition` additionally emit `progress: 0`
 *    instead of omitting the field, so UI that forwards `progress`
 *    to a `<ProgressBar>` can treat the value as always-present.
 *  - Any non-number field is treated as missing (`null`).
 *
 * The function never throws; malformed / missing data returns the
 * neutral empty shape for the requested module.
 */
export function selectModulePreview(
  moduleId: QuickStatsModuleId,
  rawJson: string | null | undefined,
): ModulePreview {
  const stats = parseQuickStatsJson(rawJson);
  const hasProgress = moduleId === "routine" || moduleId === "nutrition";
  if (!stats) return hasProgress ? EMPTY_WITH_PROGRESS : EMPTY;

  switch (moduleId) {
    case "finyk": {
      const todaySpent = asFiniteNumber(stats.todaySpent);
      const budgetLeft = asFiniteNumber(stats.budgetLeft);
      return {
        main: todaySpent ? formatMoney(todaySpent) : null,
        sub: budgetLeft ? `Залишок: ${formatMoney(budgetLeft)}` : null,
      };
    }
    case "fizruk": {
      const weekWorkouts = asFiniteNumber(stats.weekWorkouts);
      const streak = asFiniteNumber(stats.streak);
      return {
        main: weekWorkouts ? `${weekWorkouts} трен.` : null,
        sub: streak ? `Серія: ${streak} днів` : null,
      };
    }
    case "routine": {
      const todayDoneRaw = stats.todayDone;
      const todayTotal = asFiniteNumber(stats.todayTotal);
      const streak = asFiniteNumber(stats.streak);
      const todayDone =
        typeof todayDoneRaw === "number" && Number.isFinite(todayDoneRaw)
          ? todayDoneRaw
          : null;
      const main =
        todayDone !== null && todayTotal !== null
          ? `${todayDone}/${todayTotal}`
          : null;
      const progress =
        todayDone !== null && todayTotal && todayTotal > 0
          ? (todayDone / todayTotal) * 100
          : 0;
      return {
        main,
        sub: streak ? `Серія: ${streak} днів` : null,
        progress,
      };
    }
    case "nutrition": {
      const todayCal = asFiniteNumber(stats.todayCal);
      const calGoal = asFiniteNumber(stats.calGoal);
      const progress =
        todayCal !== null && calGoal && calGoal > 0
          ? (todayCal / calGoal) * 100
          : 0;
      return {
        main: todayCal ? `${todayCal} ккал` : null,
        sub: calGoal ? `Ціль: ${calGoal} ккал` : null,
        progress,
      };
    }
    default: {
      // Exhaustiveness guard — only reachable if a new module id is
      // added to `QUICK_STATS_MODULE_IDS` without a selector branch.
      const _exhaustive: never = moduleId;
      void _exhaustive;
      return EMPTY;
    }
  }
}
