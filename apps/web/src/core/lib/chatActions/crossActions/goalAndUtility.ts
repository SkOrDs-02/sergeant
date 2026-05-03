import { ls, lsSet } from "../../hubChatUtils";
import type { ConvertUnitsAction, SetGoalAction } from "../types";

export function setGoal(action: SetGoalAction): string {
  const {
    description,
    target_weight_kg,
    target_date,
    daily_kcal,
    workouts_per_week,
  } = (action as SetGoalAction).input;
  const desc = (description || "").trim();
  if (!desc) return "Потрібен опис цілі.";
  const goals = ls<
    Array<{
      id: string;
      description: string;
      targetWeightKg?: number;
      targetDate?: string;
      dailyKcal?: number;
      workoutsPerWeek?: number;
      createdAt: string;
    }>
  >("hub_goals_v1", []);
  const goal: (typeof goals)[0] = {
    id: `goal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    description: desc,
    createdAt: new Date().toISOString(),
  };
  const parts: string[] = [`Ціль "${desc}" створено`];
  if (target_weight_kg != null) {
    const tw = Number(target_weight_kg);
    if (Number.isFinite(tw) && tw > 0) {
      goal.targetWeightKg = tw;
      parts.push(`цільова вага: ${tw} кг`);
    }
  }
  if (target_date && /^\d{4}-\d{2}-\d{2}$/.test(target_date)) {
    goal.targetDate = target_date;
    parts.push(`дедлайн: ${target_date}`);
  }
  if (daily_kcal != null) {
    const dk = Number(daily_kcal);
    if (Number.isFinite(dk) && dk > 0) {
      goal.dailyKcal = dk;
      parts.push(`калорії: ${dk} ккал/день`);
      const prefs = ls<Record<string, unknown>>("nutrition_prefs_v1", {});
      prefs.dailyTargetKcal = dk;
      lsSet("nutrition_prefs_v1", prefs);
    }
  }
  if (workouts_per_week != null) {
    const wpw = Number(workouts_per_week);
    if (Number.isFinite(wpw) && wpw > 0) {
      goal.workoutsPerWeek = wpw;
      parts.push(`тренувань/тиждень: ${wpw}`);
    }
  }
  goals.push(goal);
  lsSet("hub_goals_v1", goals);
  return parts.join(", ") + ` (id:${goal.id})`;
}

export function convertUnits(action: ConvertUnitsAction): string {
  const { value, from, to } = (action as ConvertUnitsAction).input;
  const v = Number(value);
  if (!Number.isFinite(v)) return "Значення має бути числом.";
  const f = (from || "").toLowerCase().trim();
  const t = (to || "").toLowerCase().trim();
  const conversions: Record<string, Record<string, (n: number) => number>> = {
    kg: { lb: (n) => n * 2.20462 },
    lb: { kg: (n) => n / 2.20462 },
    cm: { in: (n) => n / 2.54 },
    in: { cm: (n) => n * 2.54 },
    km: { mi: (n) => n * 0.621371 },
    mi: { km: (n) => n / 0.621371 },
    c: { f: (n) => (n * 9) / 5 + 32 },
    f: { c: (n) => ((n - 32) * 5) / 9 },
    kcal: { kj: (n) => n * 4.184 },
    kj: { kcal: (n) => n / 4.184 },
    m: { ft: (n) => n * 3.28084 },
    ft: { m: (n) => n / 3.28084 },
    g: { oz: (n) => n / 28.3495 },
    oz: { g: (n) => n * 28.3495 },
  };
  const fn = conversions[f]?.[t];
  if (!fn)
    return `Невідома конвертація: ${f} → ${t}. Підтримуються: kg↔lb, cm↔in, km↔mi, c↔f, kcal↔kj, m↔ft, g↔oz`;
  const result = Math.round(fn(v) * 100) / 100;
  return `${v} ${f} = ${result} ${t}`;
}
