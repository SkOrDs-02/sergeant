import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { messages } from "@shared/i18n/uk";

/**
 * UX-roast 2026-05 §3.4 — наукові «м'які» межі для денних цілей.
 *
 * Значення поза цими межами не блокують форму (користувач все ще
 * може зберегти такі цілі), але показують попередження-баннер, бо
 * ймовірно це була помилка набору або діапазон, що потребує
 * медичного нагляду.
 *
 * Джерела:
 * - Kcal min 800 / max 6000:
 *   - WHO та American College of Sports Medicine: мінімум ~1200 ккал
 *     (жінки) / ~1500 (чоловіки) для уникнення дефіциту нутрієнтів.
 *   - <800 ккал — Very Low Calorie Diet, тільки під медичним наглядом.
 *   - >6000 ккал — навіть Майкл Фелпс на тренувальному циклі їв ~10к,
 *     але такі діапазони не для пересічного користувача додатку.
 * - Protein 30–300 г: 30 г ≈ нижня межа RDA для дорослої людини;
 *   300 г = ~3 г/кг для 100-кг атлета (стеля для гіпертрофії
 *   за мета-аналізом Morton et al., 2017).
 * - Fat 20–250 г: 20 г ≈ мінімум незамінних жирних кислот; верх
 *   250 г покриває навіть високожирові кето-дієти.
 * - Carbs ≤700 г: верхня межа для endurance-атлетів (Burke et al.,
 *   2011). Низької межі немає — кето / lazy-keto з ~20 г допустимо.
 */
export const GOAL_BOUNDS = {
  kcal: { min: 800, max: 6000 },
  protein_g: { min: 30, max: 300 },
  fat_g: { min: 20, max: 250 },
  carbs_g: { min: 0, max: 700 },
} as const;

export interface GoalRangeIssue {
  field: "kcal" | "protein_g" | "fat_g" | "carbs_g";
  kind: "low" | "high";
  message: string;
}

/**
 * PR-37 ux-roast 2026-Q3 / §3.3.
 *
 * Перевіряє, чи цільові макро вкладаються в цільові ккал. Якщо
 * ні — повертає {kind: "over"} з різницею; якщо вкладаються, але
 * істотно недотягують — {kind: "under"}; інакше null.
 *
 * Допуск ±5% покриває звичайне округлення macro-grams (1г білка ≠
 * рівно 4 ккал у живій їжі), щоб не сипати warnings на пресети.
 */
export function calcMacroKcalMismatch(prefs: NutritionPrefs): {
  kind: "over" | "under";
  target: number;
  calc: number;
  diff: number;
} | null {
  const target = prefs.dailyTargetKcal ?? 0;
  if (target <= 0) return null;
  const prot = prefs.dailyTargetProtein_g ?? 0;
  const fat = prefs.dailyTargetFat_g ?? 0;
  const carb = prefs.dailyTargetCarbs_g ?? 0;
  if (prot <= 0 && fat <= 0 && carb <= 0) return null;
  const calc = Math.round(prot * 4 + fat * 9 + carb * 4);
  const tolerance = Math.round(target * 0.05);
  const diff = calc - target;
  if (diff > tolerance) {
    return { kind: "over", target, calc, diff };
  }
  if (diff < -tolerance) {
    return { kind: "under", target, calc, diff };
  }
  return null;
}

export function calcGoalRangeIssues(prefs: NutritionPrefs): GoalRangeIssue[] {
  const RANGE_COPY = messages.nutritionGoalRange;
  const issues: GoalRangeIssue[] = [];

  const kcal = prefs.dailyTargetKcal;
  if (kcal != null && kcal > 0) {
    if (kcal < GOAL_BOUNDS.kcal.min) {
      issues.push({
        field: "kcal",
        kind: "low",
        message: RANGE_COPY.kcalTooLow,
      });
    } else if (kcal > GOAL_BOUNDS.kcal.max) {
      issues.push({
        field: "kcal",
        kind: "high",
        message: RANGE_COPY.kcalTooHigh,
      });
    }
  }

  const protein = prefs.dailyTargetProtein_g;
  if (protein != null && protein > 0) {
    if (protein < GOAL_BOUNDS.protein_g.min) {
      issues.push({
        field: "protein_g",
        kind: "low",
        message: RANGE_COPY.proteinTooLow,
      });
    } else if (protein > GOAL_BOUNDS.protein_g.max) {
      issues.push({
        field: "protein_g",
        kind: "high",
        message: RANGE_COPY.proteinTooHigh,
      });
    }
  }

  const fat = prefs.dailyTargetFat_g;
  if (fat != null && fat > 0) {
    if (fat < GOAL_BOUNDS.fat_g.min) {
      issues.push({
        field: "fat_g",
        kind: "low",
        message: RANGE_COPY.fatTooLow,
      });
    } else if (fat > GOAL_BOUNDS.fat_g.max) {
      issues.push({
        field: "fat_g",
        kind: "high",
        message: RANGE_COPY.fatTooHigh,
      });
    }
  }

  const carbs = prefs.dailyTargetCarbs_g;
  if (carbs != null && carbs > GOAL_BOUNDS.carbs_g.max) {
    issues.push({
      field: "carbs_g",
      kind: "high",
      message: RANGE_COPY.carbsTooHigh,
    });
  }

  return issues;
}
