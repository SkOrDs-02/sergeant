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
 * Pick the primary module promoted by the FTUX `FirstActionHeroCard`.
 *
 * Goal-aware (S2.1): if the user committed to an explicit goal in the
 * onboarding goals step (finyk budget, fizruk weekly target, routine
 * first habit, nutrition objective) AND that module is in their vibe
 * picks, it wins. The CTA then lines up with the intent the user just
 * spelled out — "Встанови бюджет 30k ₴" feels personal in a way that
 * the static-priority "Створи першу звичку" never could for a finance-
 * driven user.
 *
 * Tie-breaking: when more than one goal is set, falls back to
 * `FIRST_ACTION_PRIORITY` (lowest-friction first). Same rule applies
 * to the no-goals path so behaviour is byte-identical to the previous
 * static `pickPrimary` when goals are empty.
 *
 * Always returns a valid `DashboardModuleId` — `routine` when `picks`
 * is empty (lazy users still get a sensible default; matches pre-S2.1).
 */
export function pickPrimaryFirstAction(
  picks: readonly string[],
  goals: OnboardingGoals,
): DashboardModuleId {
  const pickSet = new Set(picks);

  // Goal-aware path: any module with an explicit goal beats one without.
  for (const moduleId of FIRST_ACTION_PRIORITY) {
    if (!pickSet.has(moduleId)) continue;
    if (hasGoalFor(moduleId, goals)) return moduleId;
  }

  // Static fallback: highest-priority pick wins.
  for (const moduleId of FIRST_ACTION_PRIORITY) {
    if (pickSet.has(moduleId)) return moduleId;
  }

  return "routine";
}
