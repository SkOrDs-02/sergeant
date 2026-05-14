/**
 * Pure-логіка для денного плану харчування — м'які наукові межі
 * для денних цілей (kcal, protein_g, fat_g, carbs_g) і перевірка
 * розходження сум макро з ккал.
 *
 * Перенесено з `apps/web/src/modules/nutrition/lib/dailyPlanValidation.ts`
 * (Phase 7 / PR DailyPlan port на mobile) — щоб web і mobile могли
 * ділити DOM-free валідацію.
 *
 * UX-roast 2026-05 §3.4: значення поза межами не блокують форму,
 * але викликають банер-попередження. Локалізовані повідомлення
 * залишаються у платформних i18n-словниках (`apps/web/.../uk.ts`,
 * `apps/mobile/.../i18n.ts` тощо) — `calcGoalRangeIssues` повертає
 * лише `field`/`kind`, споживач підтягує текст.
 *
 * Джерела м'яких меж:
 * - Kcal min 800 / max 6000: WHO та American College of Sports
 *   Medicine — мінімум ~1200 ккал (жінки) / ~1500 (чоловіки);
 *   <800 ккал — Very Low Calorie Diet (тільки під наглядом).
 *   >6000 ккал — навіть Майкл Фелпс на тренувальному циклі їв ~10к,
 *   але такі діапазони не для пересічного користувача додатку.
 * - Protein 30–300 г: 30 г ≈ нижня RDA для дорослої людини; 300 г =
 *   ~3 г/кг для 100-кг атлета (стеля для гіпертрофії за мета-аналізом
 *   Morton et al., 2017).
 * - Fat 20–250 г: 20 г ≈ мінімум незамінних жирних кислот;
 *   верх 250 г покриває високожирові кето-дієти.
 * - Carbs ≤700 г: верхня межа для endurance-атлетів (Burke et al.,
 *   2011). Низької межі немає — кето / lazy-keto з ~20 г допустимо.
 */
import type { NutritionPrefs } from "./nutritionTypes.js";

export const GOAL_BOUNDS = {
  kcal: { min: 800, max: 6000 },
  protein_g: { min: 30, max: 300 },
  fat_g: { min: 20, max: 250 },
  carbs_g: { min: 0, max: 700 },
} as const;

export type GoalRangeField = "kcal" | "protein_g" | "fat_g" | "carbs_g";
export type GoalRangeKind = "low" | "high";

export interface GoalRangeIssue {
  field: GoalRangeField;
  kind: GoalRangeKind;
}

/**
 * Перевіряє, чи цільові макро вкладаються в цільові ккал. Якщо ні —
 * повертає {kind: "over"} з різницею; якщо вкладаються, але істотно
 * недотягують — {kind: "under"}; інакше null.
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

/**
 * Повертає масив порушень денних меж — лише `field`/`kind`. UI-шар
 * (web/mobile) мапить пару на локалізоване повідомлення.
 */
export function calcGoalRangeIssues(prefs: NutritionPrefs): GoalRangeIssue[] {
  const issues: GoalRangeIssue[] = [];

  const kcal = prefs.dailyTargetKcal;
  if (kcal != null && kcal > 0) {
    if (kcal < GOAL_BOUNDS.kcal.min) {
      issues.push({ field: "kcal", kind: "low" });
    } else if (kcal > GOAL_BOUNDS.kcal.max) {
      issues.push({ field: "kcal", kind: "high" });
    }
  }

  const protein = prefs.dailyTargetProtein_g;
  if (protein != null && protein > 0) {
    if (protein < GOAL_BOUNDS.protein_g.min) {
      issues.push({ field: "protein_g", kind: "low" });
    } else if (protein > GOAL_BOUNDS.protein_g.max) {
      issues.push({ field: "protein_g", kind: "high" });
    }
  }

  const fat = prefs.dailyTargetFat_g;
  if (fat != null && fat > 0) {
    if (fat < GOAL_BOUNDS.fat_g.min) {
      issues.push({ field: "fat_g", kind: "low" });
    } else if (fat > GOAL_BOUNDS.fat_g.max) {
      issues.push({ field: "fat_g", kind: "high" });
    }
  }

  const carbs = prefs.dailyTargetCarbs_g;
  if (carbs != null && carbs > GOAL_BOUNDS.carbs_g.max) {
    issues.push({ field: "carbs_g", kind: "high" });
  }

  return issues;
}
