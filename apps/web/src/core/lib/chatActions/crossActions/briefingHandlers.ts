import { ls } from "../../hubChatUtils";
import { safeReadLS } from "@shared/lib/storage/storage";
import { getTxStatAmount } from "../../../../modules/finyk/utils";
import type { HabitState, NutritionDay, Workout } from "../types";

export function morningBriefing(): string {
  const now = new Date();
  const todayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const parts: string[] = [
    `Доброго ранку! Сьогодні ${now.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" })}`,
  ];
  const routineState = ls<HabitState | null>("hub_routine_v1", null);
  if (routineState?.habits) {
    const activeHabits = routineState.habits.filter(
      (h) => !(h as Record<string, unknown>).archived,
    );
    const completions = routineState.completions || {};
    const done = activeHabits.filter(
      (h) =>
        Array.isArray(completions[h.id]) &&
        completions[h.id]!.includes(todayKey),
    );
    parts.push(`Звички: ${done.length}/${activeHabits.length} виконано`);
  }
  const wParsed = safeReadLS<Workout[] | { workouts?: Workout[] } | null>(
    "fizruk_workouts_v1",
    null,
  );
  let workouts: Workout[] = [];
  if (Array.isArray(wParsed)) workouts = wParsed;
  else if (wParsed && Array.isArray(wParsed.workouts))
    workouts = wParsed.workouts;
  const todayWorkouts = workouts.filter(
    (w) => w.startedAt.startsWith(todayKey) && w.planned && !w.endedAt,
  );
  if (todayWorkouts.length > 0) {
    parts.push(`Заплановано тренувань: ${todayWorkouts.length}`);
  }
  const nutritionLog = ls<Record<string, NutritionDay>>("nutrition_log_v1", {});
  const todayMeals = nutritionLog[todayKey]?.meals || [];
  const todayKcal = todayMeals.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0);
  if (todayKcal > 0) {
    parts.push(`Калорії: ${Math.round(todayKcal)} ккал`);
  }
  return parts.join("\n");
}

export function weeklySummary(): string {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const parts: string[] = ["Тижневий підсумок:"];
  const wParsed = safeReadLS<Workout[] | { workouts?: Workout[] } | null>(
    "fizruk_workouts_v1",
    null,
  );
  let workouts: Workout[] = [];
  if (Array.isArray(wParsed)) workouts = wParsed;
  else if (wParsed && Array.isArray(wParsed.workouts))
    workouts = wParsed.workouts;
  const weekWorkouts = workouts.filter(
    (w) => w.endedAt && new Date(w.startedAt).getTime() > weekAgo.getTime(),
  );
  parts.push(`Тренувань: ${weekWorkouts.length}`);
  const totalVolume = weekWorkouts.reduce(
    (total, w) =>
      total +
      w.items.reduce(
        (s, item) =>
          s + item.sets.reduce((ss, set) => ss + set.weightKg * set.reps, 0),
        0,
      ),
    0,
  );
  if (totalVolume > 0) parts.push(`Об'єм: ${Math.round(totalVolume)} кг×повт`);
  const routineState = ls<HabitState | null>("hub_routine_v1", null);
  if (routineState?.habits) {
    const activeHabits = routineState.habits.filter(
      (h) => !(h as Record<string, unknown>).archived,
    );
    const completions = routineState.completions || {};
    let totalDone = 0;
    let totalPossible = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dk = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0"),
      ].join("-");
      totalPossible += activeHabits.length;
      for (const h of activeHabits) {
        if (Array.isArray(completions[h.id]) && completions[h.id]!.includes(dk))
          totalDone++;
      }
    }
    const pct =
      totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;
    parts.push(`Звички: ${pct}% (${totalDone}/${totalPossible})`);
  }
  const nutritionLog = ls<Record<string, NutritionDay>>("nutrition_log_v1", {});
  const weekKcal: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dk = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
    const dayMeals = nutritionLog[dk]?.meals || [];
    const k = dayMeals.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0);
    if (k > 0) weekKcal.push(k);
  }
  if (weekKcal.length > 0) {
    const avg = Math.round(
      weekKcal.reduce((a, b) => a + b, 0) / weekKcal.length,
    );
    parts.push(`Калорії: ~${avg} ккал/день (${weekKcal.length} днів)`);
  }
  const txCache = ls<{
    txs?: Array<{
      id: string;
      amount: number;
      time?: number;
      description?: string;
      mcc?: number;
    }>;
  } | null>("finyk_tx_cache", null);
  const txSplits = ls<Record<string, unknown>>("finyk_tx_splits", {});
  if (txCache?.txs) {
    const weekTs = weekAgo.getTime() / 1000;
    const weekTxs = txCache.txs.filter((t) => (t.time || 0) > weekTs);
    const spent = weekTxs
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + getTxStatAmount(t, txSplits), 0);
    parts.push(`Витрати: ${Math.round(spent)} грн`);
  }
  return parts.join("\n");
}
