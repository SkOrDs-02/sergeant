/**
 * Pure helpers that turn the hub-level biometrics record (`hub_biometrics_v1`,
 * owned by `apps/web/src/core/profile/biometrics.ts`) into Nutrition daily
 * targets — kcal + protein/fat/carb grams.
 *
 * The whole calculation lives here, away from `DailyPlanCard.tsx`, so it
 * can be unit-tested without React and reused later (e.g. by the AI plan
 * prompt builder, or by mobile in a future PR).
 *
 * ## Formula
 *
 * - **BMR — Mifflin-St Jeor:** `10·kg + 6.25·cm − 5·age + (5 ♂ | −161 ♀)`.
 *   Standard endurance/dietetics reference; matches the formulas linked
 *   from the user's request (Mifflin presets 1.2/1.375/1.55/1.725/1.9).
 * - **TDEE = BMR × activity multiplier**, where the 5-tier ladder maps
 *   to the canonical Mifflin numbers (sedentary 1.2 → very_active 1.9).
 * - **Goal adjustment:** `kcal = TDEE + delta`, `delta ∈ {−500, 0, +300}`
 *   for cutting / maintenance / bulking. Half-pound-per-week deficit on
 *   the cut, modest surplus on the bulk — same direction as the static
 *   1500 / 2000 / 2700 presets in `DailyPlanCard`, just personalised.
 * - **Macros (g/kg of CURRENT bodyweight):**
 *
 *   |              | protein g/kg | fat g/kg | carbs           |
 *   | ------------ | ------------ | -------- | --------------- |
 *   | cutting      | 2.0          | 0.8      | from remainder  |
 *   | maintenance  | 1.6          | 1.0      | from remainder  |
 *   | bulking      | 1.8          | 1.0      | from remainder  |
 *
 *   Carbs are filled in last so the macros sum (protein·4 + fat·9 +
 *   carbs·4) rounds back to the kcal target — the existing
 *   `calcMacroKcalMismatch` warning then stays quiet for our own
 *   numbers.
 *
 * Returning `null` means biometrics is missing a required field (height,
 * weight, sex, activity, or birth-date). The caller (the
 * "Розрахувати з профілю" CTA) hides itself or surfaces a hint pointing
 * the user back to Profile → Біометрія.
 */
import {
  ACTIVITY_LEVELS,
  computeAgeYears,
  type ActivityLevel,
  type Biometrics,
  type Sex,
} from "../../../core/profile/biometrics";

export const NUTRITION_GOALS = ["cutting", "maintenance", "bulking"] as const;
export type NutritionGoalId = (typeof NUTRITION_GOALS)[number];

/**
 * Mifflin-St Jeor activity multipliers — re-export so consumers don't
 * have to duplicate the table. Keys match the `ActivityLevel` ladder
 * stored in biometrics.
 */
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/**
 * Per-goal kcal adjustment relative to TDEE. The numbers mirror the
 * static `DailyPlanCard` presets' direction — modest cut, level
 * maintenance, modest surplus — without being so aggressive that the
 * user has no buffer for a hard training day.
 */
export const GOAL_KCAL_DELTA: Record<NutritionGoalId, number> = {
  cutting: -500,
  maintenance: 0,
  bulking: 300,
};

interface MacroSplit {
  proteinPerKg: number;
  fatPerKg: number;
}

const GOAL_MACRO_SPLIT: Record<NutritionGoalId, MacroSplit> = {
  cutting: { proteinPerKg: 2.0, fatPerKg: 0.8 },
  maintenance: { proteinPerKg: 1.6, fatPerKg: 1.0 },
  bulking: { proteinPerKg: 1.8, fatPerKg: 1.0 },
};

export interface TdeeInput {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
  activityLevel: ActivityLevel;
}

/**
 * BMR via Mifflin-St Jeor (kcal/day). Pure number-in / number-out;
 * does not round so callers can apply the activity multiplier first
 * and round once at the end.
 */
export function mifflinStJeorBmr(
  input: Omit<TdeeInput, "activityLevel">,
): number {
  const { weightKg, heightCm, ageYears, sex } = input;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return sex === "male" ? base + 5 : base - 161;
}

/**
 * TDEE = BMR × activity multiplier (kcal/day). Returned unrounded so
 * the goal-adjusted target can be the single rounding step.
 */
export function computeTdee(input: TdeeInput): number {
  return mifflinStJeorBmr(input) * ACTIVITY_MULTIPLIERS[input.activityLevel];
}

export interface NutritionTargets {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

/**
 * Strict variant for callers that already validated their inputs (e.g.
 * the unit tests). Returns the targets straight, no `null` branch.
 */
export function computeNutritionTargets(
  input: TdeeInput,
  goal: NutritionGoalId,
): NutritionTargets {
  const tdee = computeTdee(input);
  const kcal = Math.max(
    1000,
    Math.round((tdee + GOAL_KCAL_DELTA[goal]) / 10) * 10,
  );

  const split = GOAL_MACRO_SPLIT[goal];
  const protein_g = Math.round(input.weightKg * split.proteinPerKg);
  const fat_g = Math.round(input.weightKg * split.fatPerKg);

  const proteinKcal = protein_g * 4;
  const fatKcal = fat_g * 9;
  const remainingKcal = Math.max(0, kcal - proteinKcal - fatKcal);
  const carbs_g = Math.round(remainingKcal / 4);

  return { kcal, protein_g, fat_g, carbs_g };
}

/**
 * Convenience adapter that takes the raw biometrics record and returns
 * `null` when any required field is missing (height/weight/sex/activity
 * or a usable birth-date). The "Розрахувати з профілю" CTA on
 * `DailyPlanCard` uses the `null` to disable the button and steer the
 * user back to Profile → Біометрія.
 */
export function computeNutritionTargetsFromBiometrics(
  biometrics: Biometrics,
  goal: NutritionGoalId,
  now: Date = new Date(),
): NutritionTargets | null {
  const ageYears = computeAgeYears(biometrics.birthDate, now);
  if (
    biometrics.weightKg == null ||
    biometrics.heightCm == null ||
    biometrics.sex == null ||
    biometrics.activityLevel == null ||
    ageYears == null
  ) {
    return null;
  }
  return computeNutritionTargets(
    {
      weightKg: biometrics.weightKg,
      heightCm: biometrics.heightCm,
      ageYears,
      sex: biometrics.sex,
      activityLevel: biometrics.activityLevel,
    },
    goal,
  );
}

/** Re-export so consumers can iterate the activity ladder without reaching
 * across the module boundary into Profile.
 */
export { ACTIVITY_LEVELS };
