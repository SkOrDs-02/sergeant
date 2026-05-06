/**
 * Onboarding goal-setting — DOM-free helpers.
 *
 * Phase 1 of the onboarding v2 rebuild: after the user picks which
 * modules they care about (vibe picks), we ask 1–2 contextual
 * questions so the hub starts personalised. The questions, storage
 * keys and validation rules live here; platform adapters bind them
 * to the appropriate `KVStore`.
 *
 * Each goal question is module-scoped. The wizard renders only
 * questions for modules the user selected as vibe picks. If
 * the user skips the goal step, all values stay `null` and the app
 * falls back to sensible defaults (same as pre-v2 behaviour).
 */

import type { DashboardModuleId } from "./dashboard";
import { readJSON, writeJSON, type KVStore } from "../storage/kv";

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export const ONBOARDING_GOALS_KEY = "hub_onboarding_goals_v1";

export interface OnboardingGoals {
  /** Monthly spending target in UAH (Finyk). */
  finykBudget: number | null;
  /** Weekly training target (Fizruk). */
  fizrukWeeklyGoal: number | null;
  /** First habit preset id (Routine). */
  routineFirstHabit: string | null;
  /** Nutrition objective (Nutrition). */
  nutritionGoal: "lose" | "gain" | "maintain" | null;
}

export const EMPTY_GOALS: Readonly<OnboardingGoals> = Object.freeze({
  finykBudget: null,
  fizrukWeeklyGoal: null,
  routineFirstHabit: null,
  nutritionGoal: null,
});

export function saveOnboardingGoals(
  store: KVStore,
  goals: OnboardingGoals,
): void {
  writeJSON(store, ONBOARDING_GOALS_KEY, goals);
}

export function getOnboardingGoals(store: KVStore): OnboardingGoals {
  const raw = readJSON<Partial<OnboardingGoals>>(store, ONBOARDING_GOALS_KEY);
  if (!raw || typeof raw !== "object") return { ...EMPTY_GOALS };
  return {
    finykBudget:
      typeof raw.finykBudget === "number" && raw.finykBudget > 0
        ? raw.finykBudget
        : null,
    fizrukWeeklyGoal:
      typeof raw.fizrukWeeklyGoal === "number" && raw.fizrukWeeklyGoal > 0
        ? raw.fizrukWeeklyGoal
        : null,
    routineFirstHabit:
      typeof raw.routineFirstHabit === "string" &&
      raw.routineFirstHabit.length > 0
        ? raw.routineFirstHabit
        : null,
    nutritionGoal:
      raw.nutritionGoal === "lose" ||
      raw.nutritionGoal === "gain" ||
      raw.nutritionGoal === "maintain"
        ? raw.nutritionGoal
        : null,
  };
}

// ---------------------------------------------------------------------------
// Question definitions
// ---------------------------------------------------------------------------

export type GoalQuestionId =
  | "finyk_budget"
  | "fizruk_weekly"
  | "routine_first_habit"
  | "nutrition_goal";

export interface GoalQuestionOption {
  value: string;
  label: string;
}

export interface GoalQuestion {
  id: GoalQuestionId;
  module: DashboardModuleId;
  title: string;
  type: "radio" | "slider";
  options?: readonly GoalQuestionOption[];
  /** Slider min/max/step/unit — only for type === "slider". */
  slider?: { min: number; max: number; step: number; unit: string };
}

/** Display order: lowest-friction first. */
const PRIORITY: readonly DashboardModuleId[] = [
  "routine",
  "finyk",
  "nutrition",
  "fizruk",
];

const ALL_QUESTIONS: readonly GoalQuestion[] = [
  {
    id: "routine_first_habit",
    module: "routine",
    title: "Яка звичка перша?",
    type: "radio",
    options: [
      { value: "water", label: "Пити воду" },
      { value: "exercise", label: "Зарядка" },
      { value: "reading", label: "Читання" },
      { value: "custom", label: "Своя" },
    ],
  },
  {
    id: "finyk_budget",
    module: "finyk",
    title: "Скільки хочеш витрачати на місяць?",
    type: "slider",
    slider: { min: 5000, max: 50000, step: 1000, unit: "₴" },
  },
  {
    id: "nutrition_goal",
    module: "nutrition",
    title: "Яка ціль харчування?",
    type: "radio",
    options: [
      { value: "lose", label: "Схуднути" },
      { value: "gain", label: "Набрати масу" },
      { value: "maintain", label: "Підтримка" },
    ],
  },
  {
    id: "fizruk_weekly",
    module: "fizruk",
    title: "Скільки тренувань на тиждень?",
    type: "radio",
    options: [
      { value: "2", label: "2" },
      { value: "3", label: "3" },
      { value: "4", label: "4" },
      { value: "5", label: "5" },
      { value: "6", label: "6" },
    ],
  },
];

/**
 * Return questions relevant to the user's module picks, ordered by
 * friction priority (routine first, fizruk last). Caps at `maxQuestions`
 * so the wizard never shows more than 2–3 questions.
 */
export function getGoalQuestions(
  picks: readonly DashboardModuleId[],
  maxQuestions = 3,
): GoalQuestion[] {
  const pickSet = new Set(picks);
  return PRIORITY.filter((m) => pickSet.has(m))
    .flatMap((m) => ALL_QUESTIONS.filter((q) => q.module === m))
    .slice(0, maxQuestions);
}

// ---------------------------------------------------------------------------
// Primary first-action picker (S2.1)
// ---------------------------------------------------------------------------

/**
 * Friction-first ordering used both for the goals wizard and the FTUX
 * first-action hero card. Routine has the lowest setup cost (no
 * numbers, no camera, no bank auth) and the highest emotional payoff
 * (7-day streak preview); fizruk needs an in-module wizard to produce
 * a real entry, so it goes last.
 */
export const FIRST_ACTION_PRIORITY: readonly DashboardModuleId[] = [
  "routine",
  "finyk",
  "nutrition",
  "fizruk",
];

/** True iff the user has set an explicit goal value for `moduleId`. */
function hasGoalFor(
  moduleId: DashboardModuleId,
  goals: OnboardingGoals,
): boolean {
  switch (moduleId) {
    case "finyk":
      return goals.finykBudget !== null;
    case "fizruk":
      return goals.fizrukWeeklyGoal !== null;
    case "routine":
      return goals.routineFirstHabit !== null;
    case "nutrition":
      return goals.nutritionGoal !== null;
  }
}

/**
 * Why a particular module ended up as the FTUX primary. Surfaced through
 * `rankFirstActionCandidates` so analytics can compute per-module first-
 * entry rate variance broken down by selection reason — the SLO PR-11 is
 * trying to move (`Per-module first-entry rate variance ↓`).
 *
 * - `no-picks` — empty picks; we fell back to the `routine` default.
 * - `single-pick` — exactly one vibe pick; that pick wins regardless of goals.
 * - `single-goal` — one goal-set module within picks; goal wins.
 * - `multi-goal-vibe` — multiple goal-set modules; first in user's vibe-pick
 *   order wins. Honours the user's explicit ordering over our static
 *   friction-first heuristic, because once the user has committed to a goal
 *   we trust their intent more than our preset.
 * - `multi-pick-static` — multiple picks, zero goals; falls back to
 *   `FIRST_ACTION_PRIORITY` (lowest-friction first) so empty-state UX is
 *   unchanged from pre-S2.1.
 */
export type FirstActionPrimaryReason =
  | "no-picks"
  | "single-pick"
  | "single-goal"
  | "multi-goal-vibe"
  | "multi-pick-static";

export interface FirstActionRanking {
  /** Module promoted into the hero CTA. */
  primary: DashboardModuleId;
  /** Why `primary` won — fed into `onboarding_first_action_*` events. */
  reason: FirstActionPrimaryReason;
  /**
   * All other picks in chip-row display order. Goal-set modules come first
   * (so a user with two goals sees both their committed modules adjacent to
   * the hero), then non-goal picks; both groups preserve the user's
   * original vibe-pick order. Sanitised: unknown ids and duplicates dropped.
   */
  others: DashboardModuleId[];
}

function sanitiseModuleIds(picks: readonly string[]): DashboardModuleId[] {
  const known = new Set<DashboardModuleId>(FIRST_ACTION_PRIORITY);
  const seen = new Set<string>();
  const out: DashboardModuleId[] = [];
  for (const id of picks) {
    if (typeof id !== "string") continue;
    if (!known.has(id as DashboardModuleId)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id as DashboardModuleId);
  }
  return out;
}

/**
 * Resolve the FTUX `FirstActionHeroCard` primary + chip ordering + analytics
 * reason from the user's vibe picks and onboarding goals.
 *
 * Goal-aware (S2.1 evolved into PR-11): a module with an explicit goal still
 * beats one without. When more than one goal is set, the **user's vibe-pick
 * order** breaks ties (was: static `FIRST_ACTION_PRIORITY`). Picking `fizruk`
 * before `finyk` in the wizard now actually surfaces fizruk as the hero when
 * both have goals — the previous heuristic always promoted finyk on the basis
 * that finance has lower setup friction, ignoring the explicit reorder.
 *
 * No-goals fallback is unchanged: `FIRST_ACTION_PRIORITY` (routine first)
 * keeps empty-state UX byte-identical to pre-S2.1.
 *
 * `others` orders goal-set picks ahead of non-goal picks so the chip row
 * groups committed modules next to the hero, surfacing the user's explicit
 * intent on a single visual sweep.
 */
export function rankFirstActionCandidates(
  picks: readonly string[],
  goals: OnboardingGoals,
): FirstActionRanking {
  const sanitised = sanitiseModuleIds(picks);

  if (sanitised.length === 0) {
    return { primary: "routine", reason: "no-picks", others: [] };
  }

  const goalPicks = sanitised.filter((id) => hasGoalFor(id, goals));

  if (goalPicks.length >= 1) {
    const primary = goalPicks[0]!;
    const remainingGoal = goalPicks.slice(1);
    const noGoal = sanitised.filter((id) => !hasGoalFor(id, goals));
    return {
      primary,
      reason: goalPicks.length === 1 ? "single-goal" : "multi-goal-vibe",
      others: [...remainingGoal, ...noGoal],
    };
  }

  if (sanitised.length === 1) {
    return { primary: sanitised[0]!, reason: "single-pick", others: [] };
  }

  for (const moduleId of FIRST_ACTION_PRIORITY) {
    if (!sanitised.includes(moduleId)) continue;
    return {
      primary: moduleId,
      reason: "multi-pick-static",
      others: sanitised.filter((id) => id !== moduleId),
    };
  }

  // Defensive: sanitised is non-empty AND FIRST_ACTION_PRIORITY covers every
  // DashboardModuleId, so the loop above always returns. This branch is here
  // for type narrowing only.
  return {
    primary: sanitised[0]!,
    reason: "multi-pick-static",
    others: sanitised.slice(1),
  };
}

/**
 * Pick the primary module promoted by the FTUX `FirstActionHeroCard`.
 *
 * Thin wrapper over `rankFirstActionCandidates` kept so existing call-sites
 * that only need the hero id (and don't care about chip ordering or analytics
 * reason) stay terse. Always returns a valid `DashboardModuleId` — `routine`
 * when `picks` is empty (lazy users still get a sensible default; matches
 * pre-S2.1).
 */
export function pickPrimaryFirstAction(
  picks: readonly string[],
  goals: OnboardingGoals,
): DashboardModuleId {
  return rankFirstActionCandidates(picks, goals).primary;
}
