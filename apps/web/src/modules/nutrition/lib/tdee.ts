/**
 * Last validated: 2026-06-15
 * Status: Active
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
import {
  ATWATER_KCAL_PER_G,
  DEFAULT_WEEKLY_RATE_KG,
  type WeeklyRateKg,
} from "@sergeant/nutrition-domain";

export const NUTRITION_GOALS = ["cutting", "maintenance", "bulking"] as const;
export type NutritionGoalId = (typeof NUTRITION_GOALS)[number];

/**
 * `NutritionPrefs.goal` existed before the TDEE presets and persisted
 * `maintain`. Keep the compatibility boundary here: calculations must never
 * dereference an absent macro split because an old device has not rewritten
 * its local preferences yet.
 */
function normalizeNutritionGoal(goal: string): NutritionGoalId {
  if (goal === "maintain") return "maintenance";
  return NUTRITION_GOALS.includes(goal as NutritionGoalId)
    ? (goal as NutritionGoalId)
    : "maintenance";
}

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
/** Оціночна енергія 1 кг маси тіла, ккал (загальноприйнята 7700). */
export const KCAL_PER_KG_BODY_MASS = 7700;

/** Добовий дефіцит схуднення для темпу кг/тиж: 0,5 → 550 ккал. */
export function weeklyRateDeficitKcal(rateKgPerWeek: number): number {
  return Math.round((KCAL_PER_KG_BODY_MASS * rateKgPerWeek) / 7);
}

/**
 * Орієнтовна дата досягнення цільової ваги: сьогодні + ceil(|вага - ціль| / темп)
 * тижнів. `null`, коли різниці немає або вхід некоректний.
 */
export function estimateGoalDate(
  weightKg: number,
  goalWeightKg: number,
  rateKgPerWeek: number,
  now: Date = new Date(),
): Date | null {
  const diff = weightKg - goalWeightKg;
  if (!(diff > 0) || !(rateKgPerWeek > 0)) return null;
  const weeks = Math.ceil(diff / rateKgPerWeek);
  // Орієнтир із точністю до доби: DST-зсув на годину тут не має значення.
  return new Date(now.getTime() + weeks * 7 * 86_400_000);
}

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
  /**
   * Динамічний режим: норма рахується від `sedentary` плюс фактично
   * спалене за день, замість статичного множника рівня активності.
   * Дефолт `false` - див. `countWorkoutsInGoal` у `biometrics.ts`.
   */
  countWorkoutsInGoal?: boolean | undefined;
  /** Сума `kcalBurned` за день. Має значення лише у динамічному режимі. */
  workoutKcal?: number | undefined;
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
  const bmr = mifflinStJeorBmr(input);
  if (!input.countWorkoutsInGoal) {
    return bmr * ACTIVITY_MULTIPLIERS[input.activityLevel];
  }
  // Множник опускається до `sedentary` НЕ як «менше активності», а тому
  // що тренування переїхали з нього у явне доданком. Лишити тут обраний
  // рівень означало б порахувати їх двічі.
  const burned = Number(input.workoutKcal);
  return (
    bmr * ACTIVITY_MULTIPLIERS.sedentary +
    (Number.isFinite(burned) && burned > 0 ? burned : 0)
  );
}

export interface NutritionTargets {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export interface NutritionTargetsExplanation {
  bmr: number;
  activityLevel: ActivityLevel;
  /** Множник, що реально застосовано (1,2 у динамічному режимі). */
  multiplier: number;
  /** Тренування за день, ккал; `0` поза динамічним режимом. */
  workoutKcal: number;
  tdee: number;
  deltaKcal: number;
  /**
   * `'floor'` - норму піднято до підлоги 1000 ккал. Обрізки до BMR тут немає
   * навмисно: сидячий профіль із дефіцитом майже завжди нижче BMR, і це
   * штатна норма (BMR-межа живе лише в автокалібруванні).
   */
  clampedBy: "floor" | null;
  targets: NutritionTargets;
}

/**
 * Єдиний розрахунок норми з розкладом для екрана («BMR × множник - дефіцит»).
 * `computeNutritionTargets` - обгортка над ним, тож число й пояснення не
 * можуть розійтись.
 */
export function explainNutritionTargets(
  input: TdeeInput,
  goal: NutritionGoalId | string,
  weeklyRateKg: WeeklyRateKg | number = DEFAULT_WEEKLY_RATE_KG,
): NutritionTargetsExplanation {
  const normalizedGoal = normalizeNutritionGoal(goal);
  const bmr = mifflinStJeorBmr(input);
  const tdee = computeTdee(input);
  const dynamic = Boolean(input.countWorkoutsInGoal);
  const burned = Number(input.workoutKcal);
  const deltaKcal =
    normalizedGoal === "cutting"
      ? -weeklyRateDeficitKcal(weeklyRateKg)
      : GOAL_KCAL_DELTA[normalizedGoal];
  const raw = Math.round((tdee + deltaKcal) / 10) * 10;
  const clampedBy = raw < 1000 ? "floor" : null;
  return {
    bmr,
    activityLevel: input.activityLevel,
    multiplier: dynamic
      ? ACTIVITY_MULTIPLIERS.sedentary
      : ACTIVITY_MULTIPLIERS[input.activityLevel],
    workoutKcal: dynamic && Number.isFinite(burned) && burned > 0 ? burned : 0,
    tdee,
    deltaKcal,
    clampedBy,
    targets: computeMacrosForKcal(
      Math.max(1000, raw),
      input.weightKg,
      normalizedGoal,
    ),
  };
}

/**
 * Strict variant for callers that already validated their inputs (e.g.
 * the unit tests). Returns the targets straight, no `null` branch.
 */
export function computeNutritionTargets(
  input: TdeeInput,
  goal: NutritionGoalId | string,
  weeklyRateKg: WeeklyRateKg | number = DEFAULT_WEEKLY_RATE_KG,
): NutritionTargets {
  return explainNutritionTargets(input, goal, weeklyRateKg).targets;
}

export function computeMacrosForKcal(
  kcal: number,
  weightKg: number,
  goal: NutritionGoalId | string,
): NutritionTargets {
  const safeKcal = Math.max(1000, Math.round(kcal / 10) * 10);
  const split = GOAL_MACRO_SPLIT[normalizeNutritionGoal(goal)];
  const protein_g = Math.round(weightKg * split.proteinPerKg);
  const fat_g = Math.round(weightKg * split.fatPerKg);

  const proteinKcal = protein_g * ATWATER_KCAL_PER_G.protein;
  const fatKcal = fat_g * ATWATER_KCAL_PER_G.fat;
  const remainingKcal = Math.max(0, safeKcal - proteinKcal - fatKcal);
  const carbs_g = Math.round(remainingKcal / ATWATER_KCAL_PER_G.carbs);

  return { kcal: safeKcal, protein_g, fat_g, carbs_g };
}

/**
 * W1-WEIGHT-SOT стадія 1: канон fizruk §10 каже «fizruk володіє тілом,
 * nutrition читає». Тому вага береться з fizruk-селектора
 * (`selectLatestBodyWeight`, union `fizruk_daily_log` + `fizruk_measurements`),
 * якщо викликач її передав, і **лише за її відсутності** — зі знімка
 * `biometrics.weightKg`. Фолбек навмисний: користувач без модуля fizruk
 * не має втратити КБЖВ-розрахунок (стара поведінка живе далі). Яка
 * таблиця канонічна і що стається з `hub_biometrics.weightKg` — питання
 * окремого ADR (стадії 3-4).
 *
 * Винесено окремо від {@link computeNutritionTargetsFromBiometrics}, щоб
 * той самий фолбек міг звірити `missingBiometricsFieldsForTdee` (там
 * інакше «вага» рахувалась би відсутньою для юзера, чиє єдине джерело —
 * fizruk-журнал, а не поле в Профілі).
 *
 * @param fizrukWeightKg Найсвіжіша вага з fizruk, або `null`/`undefined`,
 *                       коли fizruk-історії немає.
 */
export function resolveEffectiveWeightKg(
  biometrics: Biometrics,
  fizrukWeightKg?: number | null,
): number | null {
  return fizrukWeightKg != null &&
    Number.isFinite(fizrukWeightKg) &&
    fizrukWeightKg > 0
    ? fizrukWeightKg
    : biometrics.weightKg;
}

/**
 * Convenience adapter that takes the raw biometrics record and returns
 * `null` when any required field is missing (height/weight/sex/activity
 * or a usable birth-date). The "Розрахувати з профілю" CTA on
 * `DailyPlanCard` uses the `null` to disable the button and steer the
 * user back to Profile → Біометрія.
 *
 * @param fizrukWeightKg Найсвіжіша вага з fizruk, або `null`/`undefined`,
 *                       коли fizruk-історії немає.
 */
export function computeNutritionTargetsFromBiometrics(
  biometrics: Biometrics,
  goal: NutritionGoalId,
  now: Date = new Date(),
  fizrukWeightKg?: number | null,
  workoutKcal?: number | null,
  weeklyRateKg: WeeklyRateKg | number = DEFAULT_WEEKLY_RATE_KG,
): NutritionTargets | null {
  return (
    explainNutritionTargetsFromBiometrics(
      biometrics,
      goal,
      now,
      fizrukWeightKg,
      workoutKcal,
      weeklyRateKg,
    )?.targets ?? null
  );
}

/** Те саме, що {@link computeNutritionTargetsFromBiometrics}, але з розкладом. */
export function explainNutritionTargetsFromBiometrics(
  biometrics: Biometrics,
  goal: NutritionGoalId,
  now: Date = new Date(),
  fizrukWeightKg?: number | null,
  workoutKcal?: number | null,
  weeklyRateKg: WeeklyRateKg | number = DEFAULT_WEEKLY_RATE_KG,
): NutritionTargetsExplanation | null {
  const ageYears = computeAgeYears(biometrics.birthDate, now);
  const weightKg = resolveEffectiveWeightKg(biometrics, fizrukWeightKg);
  if (
    weightKg == null ||
    biometrics.heightCm == null ||
    biometrics.sex == null ||
    biometrics.activityLevel == null ||
    ageYears == null
  ) {
    return null;
  }
  return explainNutritionTargets(
    {
      weightKg,
      heightCm: biometrics.heightCm,
      ageYears,
      sex: biometrics.sex,
      activityLevel: biometrics.activityLevel,
      countWorkoutsInGoal: biometrics.countWorkoutsInGoal,
      workoutKcal: workoutKcal ?? 0,
    },
    goal,
    weeklyRateKg,
  );
}

/** Re-export so consumers can iterate the activity ladder without reaching
 * across the module boundary into Profile.
 */
export { ACTIVITY_LEVELS };
