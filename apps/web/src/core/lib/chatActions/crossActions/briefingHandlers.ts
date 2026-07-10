/* eslint-disable @typescript-eslint/no-non-null-assertion --
   Pre-existing non-null assertions on already-Array.isArray-guarded
   index lookups. */
/* eslint-disable sergeant-design/no-raw-storage-key --
   Tx splits stay on LS; bank transactions now come from the Mono mirror
   reader (Dual-write teardown Phase 3). */
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { ls } from "../../hubChatUtils";
import { getTxStatAmount } from "../../../../modules/finyk/utils";
import { getCachedFinykMonoMirrorState } from "../../../../modules/finyk/lib/monoMirrorReader";
import { loadRoutineState } from "../../../../modules/routine/lib/routineStorage";
import { loadNutritionLog } from "../../../../modules/nutrition/lib/nutritionStorage";
import { readFizrukWorkouts } from "../fizrukActions/shared";

export function morningBriefing(): string {
  const now = new Date();
  const todayKey = getKyivDayKey(now);
  const dateLabel = new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const parts: string[] = [`Доброго ранку! Сьогодні ${dateLabel}`];
  const routineState = loadRoutineState();
  if (routineState.habits.length > 0) {
    const activeHabits = routineState.habits.filter((h) => !h.archived);
    const completions = routineState.completions || {};
    const done = activeHabits.filter(
      (h) =>
        Array.isArray(completions[h.id]) &&
        completions[h.id]!.includes(todayKey),
    );
    parts.push(`Звички: ${done.length}/${activeHabits.length} виконано`);
  }
  const workouts = readFizrukWorkouts();
  const todayWorkouts = workouts.filter(
    (w) =>
      w.startedAt.startsWith(todayKey) && w["planned"] === true && !w.endedAt,
  );
  if (todayWorkouts.length > 0) {
    parts.push(`Заплановано тренувань: ${todayWorkouts.length}`);
  }
  const nutritionLog = loadNutritionLog();
  const todayMeals = nutritionLog[todayKey]?.meals || [];
  const todayKcal = todayMeals.reduce((s, m) => s + (m?.macros?.kcal ?? 0), 0);
  if (todayKcal > 0) {
    parts.push(`Калорії: ${Math.round(todayKcal)} ккал`);
  }
  return parts.join("\n");
}

export function weeklySummary(): string {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const parts: string[] = ["Тижневий підсумок:"];
  const workouts = readFizrukWorkouts();
  const weekWorkouts = workouts.filter(
    (w) => w.endedAt && new Date(w.startedAt).getTime() > weekAgo.getTime(),
  );
  parts.push(`Тренувань: ${weekWorkouts.length}`);
  const totalVolume = weekWorkouts.reduce(
    (total, w) =>
      total +
      w.items.reduce(
        (s, item) =>
          s +
          (item.sets ?? []).reduce(
            (ss, set) => ss + set.weightKg * set.reps,
            0,
          ),
        0,
      ),
    0,
  );
  if (totalVolume > 0) parts.push(`Об'єм: ${Math.round(totalVolume)} кг×повт`);
  const routineState = loadRoutineState();
  if (routineState.habits.length > 0) {
    const activeHabits = routineState.habits.filter((h) => !h.archived);
    const completions = routineState.completions || {};
    let totalDone = 0;
    let totalPossible = 0;
    for (let i = 0; i < 7; i++) {
      const dk = getKyivDayKey(new Date(now.getTime() - i * 86400000));
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
  const nutritionLog = loadNutritionLog();
  const weekKcal: number[] = [];
  for (let i = 0; i < 7; i++) {
    const dk = getKyivDayKey(new Date(now.getTime() - i * 86400000));
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
  const mirrorTxs = getCachedFinykMonoMirrorState().transactions as Array<{
    id: string;
    amount: number;
    time?: number;
    description?: string;
    mcc?: number;
  }>;
  const txSplits = ls<Record<string, unknown>>("finyk_tx_splits", {});
  if (mirrorTxs.length > 0) {
    const weekTs = weekAgo.getTime() / 1000;
    const weekTxs = mirrorTxs.filter((t) => (t.time || 0) > weekTs);
    const spent = weekTxs
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + getTxStatAmount(t, txSplits), 0);
    parts.push(`Витрати: ${Math.round(spent)} грн`);
  }
  return parts.join("\n");
}
