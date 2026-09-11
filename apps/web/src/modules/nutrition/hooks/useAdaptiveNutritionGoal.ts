import { useEffect, useMemo } from "react";
import {
  addDeviceDays,
  clampGoalDelta,
  deviceDayKey,
  measuredTdee,
  type IntakeDay,
  type NutritionLog,
  type NutritionPrefs,
  type WeightPoint,
} from "@sergeant/nutrition-domain";
import { computeWorkoutKcalBurned } from "@sergeant/fizruk-domain";
import { computeAgeYears } from "../../../core/profile/biometrics";
import { useBiometrics } from "../../../core/profile/useBiometrics";
import { getCachedFizrukSqliteState } from "../../fizruk/lib/sqliteReader";
import { getDaySummary } from "../lib/nutritionStorage";
import {
  persistAdaptiveNutritionPrefs,
  persistProfileNutritionPrefs,
} from "../lib/nutritionStorage";
import {
  GOAL_KCAL_DELTA,
  computeMacrosForKcal,
  computeNutritionTargetsFromBiometrics,
  mifflinStJeorBmr,
} from "../lib/tdee";

export interface AdaptiveGoalState {
  mode: "disabled" | "profile-needed" | "calibrating" | "active";
  completeDays: number;
  weightPoints: number;
  lastUpdatedAt: string | null;
}

/** Вікно аналізу: 14 завершених днів до сьогодні. */
const WINDOW_DAYS = 14;

let lastScheduledSignature = "";

/**
 * Скидає модульний дедуп планувальника.
 *
 * `lastScheduledSignature` навмисно живе поза компонентом: він гасить
 * повторний запис тієї самої цілі при кожному ре-рендері. Але між
 * тест-кейсами він же робить другий `render()` беззвучним no-op-ом, тож
 * тестам потрібен явний ресет — як `__setFizrukSqliteCacheForTests` у
 * `modules/fizruk/lib/sqliteReader.ts`.
 */
export function __resetAdaptiveGoalScheduleForTests(): void {
  lastScheduledSignature = "";
}

function pointDay(at: string): string | null {
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? null : deviceDayKey(parsed);
}

function collectWeights(start: string, end: string): WeightPoint[] {
  const cache = getCachedFizrukSqliteState();
  const byDay = new Map<string, number>();
  for (const entry of [...cache.measurements, ...cache.dailyLog]) {
    const value = entry.weightKg;
    const dateKey = pointDay(entry.at);
    if (
      dateKey &&
      dateKey >= start &&
      dateKey <= end &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0 &&
      !byDay.has(dateKey)
    ) {
      byDay.set(dateKey, value);
    }
  }
  return [...byDay].map(([dateKey, weightKg]) => ({ dateKey, weightKg }));
}

/**
 * Найсвіжіша вага з вікна.
 *
 * Не `weights.at(-1)`: `collectWeights` наповнює `Map` у порядку кешу
 * fizruk (newest-first, спершу `measurements`, потім `dailyLog`), тож
 * останній елемент масиву — найСТАРІШИЙ день, ще й залежний від того,
 * який із двох джерельних масивів непорожній. Доменні функції
 * (`weightTrendEma`) сортують самі й цього не помічають, а ось
 * розрахунок цілі брав не ту вагу.
 */
function latestWeightKg(weights: readonly WeightPoint[]): number | null {
  let latest: WeightPoint | null = null;
  for (const point of weights) {
    if (!latest || point.dateKey > latest.dateKey) latest = point;
  }
  return latest?.weightKg ?? null;
}

/**
 * Середньодобові витрати на тренуваннях за те саме вікно, що й решта
 * аналізу.
 *
 * Навіщо середнє, а не «сьогодні» (`useTodayWorkoutKcal`): тут рахується
 * БАЗОВА денна норма, і вона не має стрибати залежно від того, чи саме
 * сьогодні був тренувальний день. `useTodayWorkoutKcal` лишається для
 * пресетів у `DailyPlanGoalSelectors`, де людина свідомо тисне
 * «розрахувати з профілю» і бачить корекцію на сьогодні.
 *
 * Має значення лише при `countWorkoutsInGoal` — у статичному режимі
 * `computeTdee` це число ігнорує, бо тренування вже сидять у множнику
 * рівня активності (`lib/tdee.ts:135-148`).
 */
function collectWorkoutKcalPerDay(
  start: string,
  end: string,
  weightKg: number | null,
): number {
  const cache = getCachedFizrukSqliteState();
  let total = 0;
  for (const workout of cache.workouts) {
    if (!workout.endedAt) continue;
    const dateKey = pointDay(workout.startedAt);
    if (!dateKey || dateKey < start || dateKey > end) continue;
    total += computeWorkoutKcalBurned(workout, weightKg) ?? 0;
  }
  return total / WINDOW_DAYS;
}

function isDue(lastUpdatedAt: string | null): boolean {
  if (!lastUpdatedAt) return true;
  const timestamp = new Date(lastUpdatedAt).getTime();
  return (
    !Number.isFinite(timestamp) || Date.now() - timestamp >= 7 * 86_400_000
  );
}

export function useAdaptiveNutritionGoal(
  log: NutritionLog,
  prefs: NutritionPrefs,
): AdaptiveGoalState {
  const { biometrics } = useBiometrics();
  const analysis = useMemo(() => {
    const end = addDeviceDays(deviceDayKey(), -1);
    const start = addDeviceDays(end, -13);
    const intakeDays: IntakeDay[] = [];
    for (let i = 0; i < 14; i += 1) {
      const dateKey = addDeviceDays(start, i);
      const summary = getDaySummary(log, dateKey);
      intakeDays.push({
        dateKey,
        kcal: summary.kcal,
        complete: summary.mealCount >= 3,
      });
    }
    const weights = collectWeights(start, end);
    const latestKg = latestWeightKg(weights);
    return {
      intakeDays,
      weights,
      latestWeightKg: latestKg,
      workoutKcalPerDay: collectWorkoutKcalPerDay(start, end, latestKg),
      measured: measuredTdee(intakeDays, weights),
    };
  }, [log]);

  const profileTargets = useMemo(
    () =>
      computeNutritionTargetsFromBiometrics(
        biometrics,
        prefs.adaptiveGoalIntent,
        undefined,
        analysis.latestWeightKg,
        analysis.workoutKcalPerDay,
      ),
    [
      analysis.latestWeightKg,
      analysis.workoutKcalPerDay,
      biometrics,
      prefs.adaptiveGoalIntent,
    ],
  );

  useEffect(() => {
    if (!prefs.adaptiveGoalEnabled || !profileTargets) return;
    const signature = [
      prefs.adaptiveGoalLastUpdatedAt ?? "new",
      prefs.dailyTargetKcal ?? "unset",
      analysis.measured?.tdeeKcal ?? "calibrating",
      prefs.adaptiveGoalIntent,
    ].join(":");
    if (lastScheduledSignature === signature) return;

    if (prefs.dailyTargetKcal == null) {
      lastScheduledSignature = signature;
      persistProfileNutritionPrefs({
        ...prefs,
        dailyTargetKcal: profileTargets.kcal,
        dailyTargetProtein_g: profileTargets.protein_g,
        dailyTargetFat_g: profileTargets.fat_g,
        dailyTargetCarbs_g: profileTargets.carbs_g,
      });
      return;
    }
    if (!analysis.measured || !isDue(prefs.adaptiveGoalLastUpdatedAt)) return;

    const ageYears = computeAgeYears(biometrics.birthDate);
    const weightKg = analysis.latestWeightKg ?? biometrics.weightKg;
    if (
      ageYears == null ||
      weightKg == null ||
      biometrics.heightCm == null ||
      biometrics.sex == null
    ) {
      return;
    }
    const bmr = mifflinStJeorBmr({
      weightKg,
      heightCm: biometrics.heightCm,
      ageYears,
      sex: biometrics.sex,
    });
    const proposed =
      analysis.measured.tdeeKcal + GOAL_KCAL_DELTA[prefs.adaptiveGoalIntent];
    const kcal = clampGoalDelta(proposed, prefs.dailyTargetKcal, bmr);
    const targets = computeMacrosForKcal(
      kcal,
      weightKg,
      prefs.adaptiveGoalIntent,
    );
    lastScheduledSignature = signature;
    persistAdaptiveNutritionPrefs({
      ...prefs,
      dailyTargetKcal: targets.kcal,
      dailyTargetProtein_g: targets.protein_g,
      dailyTargetFat_g: targets.fat_g,
      dailyTargetCarbs_g: targets.carbs_g,
      adaptiveGoalLastUpdatedAt: new Date().toISOString(),
    });
  }, [analysis, biometrics, prefs, profileTargets]);

  if (!prefs.adaptiveGoalEnabled) {
    return {
      mode: "disabled",
      completeDays: 0,
      weightPoints: 0,
      lastUpdatedAt: null,
    };
  }
  if (!profileTargets) {
    return {
      mode: "profile-needed",
      completeDays:
        analysis.measured?.completeDays ??
        analysis.intakeDays.filter((d) => d.complete).length,
      weightPoints: analysis.weights.length,
      lastUpdatedAt: prefs.adaptiveGoalLastUpdatedAt,
    };
  }
  return {
    mode: analysis.measured ? "active" : "calibrating",
    completeDays:
      analysis.measured?.completeDays ??
      analysis.intakeDays.filter((d) => d.complete).length,
    weightPoints: analysis.weights.length,
    lastUpdatedAt: prefs.adaptiveGoalLastUpdatedAt,
  };
}
