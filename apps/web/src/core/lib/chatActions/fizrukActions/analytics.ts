import { ls } from "../../hubChatUtils";
import { readWorkouts } from "./shared";
import type {
  SuggestWorkoutAction,
  CompareProgressAction,
  WeightChartAction,
  WorkoutItem,
  Workout,
  ChatActionResult,
} from "../types";

export function suggestWorkout(action: SuggestWorkoutAction): ChatActionResult {
  const { focus } = action.input || {};
  const workouts = readWorkouts();
  const completed = workouts.filter((w) => w.endedAt);
  if (completed.length === 0) {
    return `Немає історії тренувань. Рекомендую почати з full-body тренування: присідання, жим лежачи, тяга, підтягування.${focus ? ` (фокус: ${focus})` : ""}`;
  }
  const muscleLastTrained: Record<string, number> = {};
  for (const w of completed) {
    const ts = new Date(w.startedAt).getTime();
    for (const item of w.items) {
      for (const mg of [...item.musclesPrimary, ...item.musclesSecondary]) {
        if (!muscleLastTrained[mg] || muscleLastTrained[mg] < ts) {
          muscleLastTrained[mg] = ts;
        }
      }
    }
  }
  const now = Date.now();
  const sorted = Object.entries(muscleLastTrained)
    .map(([m, ts]) => ({
      muscle: m,
      daysAgo: Math.round((now - ts) / 86400000),
    }))
    .sort((a, b) => b.daysAgo - a.daysAgo);
  const neglected = sorted.filter((s) => s.daysAgo >= 3).slice(0, 5);
  const lastW = completed.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )[0];
  const lastExercises = lastW
    ? lastW.items.map((i) => i.nameUk).join(", ")
    : "";
  const parts: string[] = [];
  if (neglected.length > 0) {
    parts.push(
      `М'язи, які найдовше не тренували: ${neglected.map((n) => `${n.muscle} (${n.daysAgo}д)`).join(", ")}`,
    );
  }
  if (lastExercises) {
    parts.push(`Останнє тренування: ${lastExercises}`);
  }
  parts.push(`Всього завершених: ${completed.length}`);
  if (focus) parts.push(`Бажаний фокус: ${focus}`);
  return parts.join(". ") + ". Рекомендацію сформовано на основі цих даних.";
}

export function compareProgress(
  action: CompareProgressAction,
): ChatActionResult {
  const { exercise_name, muscle_group, period_days } = action.input || {};
  const rawDays = Number(period_days);
  const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 30;
  const workouts = readWorkouts();
  const completed = workouts.filter((w) => w.endedAt);
  if (completed.length === 0) return "Немає завершених тренувань для аналізу.";
  const now = Date.now();
  const cutoff = now - days * 86400000;
  const midpoint = now - (days / 2) * 86400000;
  const firstHalf = completed.filter((w) => {
    const ts = new Date(w.startedAt).getTime();
    return ts >= cutoff && ts < midpoint;
  });
  const secondHalf = completed.filter((w) => {
    const ts = new Date(w.startedAt).getTime();
    return ts >= midpoint;
  });
  const matchItem = (item: WorkoutItem): boolean => {
    if (
      exercise_name &&
      item.nameUk.toLowerCase().includes(exercise_name.toLowerCase())
    )
      return true;
    if (
      muscle_group &&
      item.musclesPrimary.some((m) =>
        m.toLowerCase().includes(muscle_group.toLowerCase()),
      )
    )
      return true;
    if (!exercise_name && !muscle_group) return true;
    return false;
  };
  const calcVolume = (ws: Workout[]): number =>
    ws.reduce(
      (total, w) =>
        total +
        w.items
          .filter(matchItem)
          .reduce(
            (s, item) =>
              s +
              item.sets.reduce((ss, set) => ss + set.weightKg * set.reps, 0),
            0,
          ),
      0,
    );
  const calcMaxWeight = (ws: Workout[]): number =>
    ws.reduce(
      (max, w) =>
        Math.max(
          max,
          ...w.items
            .filter(matchItem)
            .flatMap((item) => item.sets.map((s) => s.weightKg)),
        ),
      0,
    );
  const vol1 = calcVolume(firstHalf);
  const vol2 = calcVolume(secondHalf);
  const max1 = calcMaxWeight(firstHalf);
  const max2 = calcMaxWeight(secondHalf);
  const label = exercise_name || muscle_group || "загалом";
  const volChange = vol1 > 0 ? Math.round(((vol2 - vol1) / vol1) * 100) : 0;
  const parts: string[] = [
    `Прогрес (${label}) за ${days} днів:`,
    `Об'єм (кг×повт): ${Math.round(vol1)} → ${Math.round(vol2)} (${volChange >= 0 ? "+" : ""}${volChange}%)`,
    `Макс. вага: ${max1} → ${max2} кг`,
    `Тренувань: ${firstHalf.length} → ${secondHalf.length}`,
  ];
  return parts.join("\n");
}

export function weightChart(action: WeightChartAction): ChatActionResult {
  const { period_days } = action.input || {};
  const rawDays = Number(period_days);
  const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 30;
  const log = ls<Array<{ at?: string; weightKg?: number | null }>>(
    "fizruk_daily_log_v1",
    [],
  );
  const cutoff = Date.now() - days * 86400000;
  const entries = log
    .filter(
      (e) =>
        e.at &&
        e.weightKg != null &&
        Number.isFinite(Number(e.weightKg)) &&
        new Date(e.at).getTime() >= cutoff,
    )
    .sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime());
  if (entries.length === 0)
    return `Немає записів ваги за останні ${days} днів.`;
  const weights = entries.map((e) => e.weightKg as number);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const first = weights[0];
  const last = weights[weights.length - 1];
  const diff = last! - first!;
  const parts: string[] = [
    `Вага за ${days} днів (${entries.length} записів):`,
    `Перша: ${first} кг → Остання: ${last} кг (${diff >= 0 ? "+" : ""}${diff.toFixed(1)} кг)`,
    `Мін: ${min} кг | Макс: ${max} кг`,
  ];
  const recent = entries.slice(-7);
  if (recent.length > 1) {
    parts.push("Останні записи:");
    for (const e of recent) {
      const d = new Date(e.at!).toLocaleDateString("uk-UA", {
        day: "numeric",
        month: "short",
      });
      parts.push(`  ${d}: ${e.weightKg} кг`);
    }
  }
  return parts.join("\n");
}
