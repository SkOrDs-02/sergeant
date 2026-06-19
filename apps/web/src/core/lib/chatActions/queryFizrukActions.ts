import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { readFizrukWorkouts } from "./fizrukActions/shared";
import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain";
import type { ChatAction, ChatActionResult } from "./types";

/**
 * Read-only "talk to your data" виконавці для Фізрука (PR2 talk-to-your-data).
 * Дзеркало серверних `QUERY_FIZRUK_TOOLS` (`toolDefs/queryFizruk.ts`). Лише
 * читають журнал тренувань через спільний `readWorkouts` (з
 * `fizrukActions/shared.ts`) і повертають числові відповіді / агрегації.
 *
 * Реєструється у `hubChatActions.ts` dispatch-chain окремою гілкою, не
 * чіпаючи мутаційний `handleFizrukAction`. Періоди рахуються від `Date.now()`
 * (days-ago cutoff) — як у наявному `fizrukActions/analytics.ts`.
 */

interface QueryWorkoutsAction {
  name: "query_workouts";
  input: {
    period_days?: number | string;
    exercise?: string;
    muscle?: string;
    limit?: number | string;
  };
}

interface ExerciseProgressAction {
  name: "exercise_progress";
  input: { exercise_name?: string; period_days?: number | string };
}

interface TrainingStatsAction {
  name: "training_stats";
  input: { period_days?: number | string; top?: number | string };
}

const DAY_MS = 86_400_000;

// ─── helpers ────────────────────────────────────────────────────────────────

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function clampDays(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(365, Math.floor(n));
}

function clamp(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

function startedTs(w: Workout): number {
  return new Date(w.startedAt).getTime();
}

function itemVolume(item: WorkoutItem): number {
  return (item.sets ?? []).reduce((s, set) => s + set.weightKg * set.reps, 0);
}

function workoutVolume(w: Workout): number {
  return w.items.reduce((s, item) => s + itemVolume(item), 0);
}

function itemMatches(
  item: WorkoutItem,
  exercise: string,
  muscle: string,
): boolean {
  if (exercise && !item.nameUk.toLowerCase().includes(exercise)) return false;
  if (
    muscle &&
    ![...item.musclesPrimary, ...item.musclesSecondary].some((m) =>
      m.toLowerCase().includes(muscle),
    )
  ) {
    return false;
  }
  return true;
}

/** Completed workouts within the last `days`, newest first. */
function completedSince(days: number): Workout[] {
  const cutoff = Date.now() - days * DAY_MS;
  return readFizrukWorkouts()
    .filter((w) => w.endedAt && startedTs(w) >= cutoff)
    .sort((a, b) => startedTs(b) - startedTs(a));
}

function dayLabel(w: Workout): string {
  return getKyivDayKey(new Date(w.startedAt));
}

function round(n: number): number {
  return Math.round(n);
}

// ─── executors ──────────────────────────────────────────────────────────────

export function queryWorkouts(action: QueryWorkoutsAction): ChatActionResult {
  const input = action.input;
  const days = clampDays(input.period_days, 30);
  const exercise = normalizeText(input.exercise);
  const muscle = normalizeText(input.muscle);
  const limit = clamp(input.limit, 15, 50);

  const matched = completedSince(days).filter((w) => {
    if (!exercise && !muscle) return true;
    return w.items.some((it) => itemMatches(it, exercise, muscle));
  });

  if (matched.length === 0) {
    const flt = exercise || muscle ? ` (${exercise || muscle})` : "";
    return `Немає завершених тренувань${flt} за останні ${days} днів.`;
  }

  const totalVolume = matched.reduce((s, w) => s + workoutVolume(w), 0);
  const shown = matched.slice(0, limit);
  const list = shown
    .map((w) => {
      const names = w.items.map((it) => it.nameUk).join(", ") || "без вправ";
      const sets = w.items.reduce((s, it) => s + (it.sets ?? []).length, 0);
      return `${dayLabel(w)}: ${names} · ${sets} підх. · ${round(workoutVolume(w))} кг×повт`;
    })
    .join("; ");
  const more =
    matched.length > shown.length
      ? ` (показано ${shown.length} з ${matched.length})`
      : "";
  return `Тренувань за ${days} днів: ${matched.length}, сумарний об'єм ${round(totalVolume)} кг×повт${more}: ${list}`;
}

export function exerciseProgress(
  action: ExerciseProgressAction,
): ChatActionResult {
  const exercise = normalizeText(action.input.exercise_name);
  if (!exercise) {
    return "Вкажи назву вправи (exercise_name) для аналізу прогресу.";
  }
  const days = clampDays(action.input.period_days, 90);

  const sessions = completedSince(days)
    .map((w) => {
      const items = w.items.filter((it) =>
        it.nameUk.toLowerCase().includes(exercise),
      );
      if (items.length === 0) return null;
      const maxWeight = Math.max(
        0,
        ...items.flatMap((it) => (it.sets ?? []).map((s) => s.weightKg)),
      );
      const reps = items.reduce(
        (s, it) => s + (it.sets ?? []).reduce((ss, set) => ss + set.reps, 0),
        0,
      );
      const volume = items.reduce((s, it) => s + itemVolume(it), 0);
      return { ts: startedTs(w), day: dayLabel(w), maxWeight, reps, volume };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => a.ts - b.ts);

  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  if (!first || !last) {
    return `Немає записів вправи "${exercise}" за останні ${days} днів.`;
  }
  const bestWeight = Math.max(...sessions.map((s) => s.maxWeight));
  const bestVolume = Math.max(...sessions.map((s) => s.volume));
  const volPct =
    first.volume > 0
      ? round(((last.volume - first.volume) / first.volume) * 100)
      : 0;
  const wDelta = last.maxWeight - first.maxWeight;
  const sign = (n: number): string => (n >= 0 ? "+" : "");

  return [
    `Прогрес "${exercise}" за ${days} днів (${sessions.length} сесій):`,
    `Макс. вага: ${first.maxWeight} → ${last.maxWeight} кг (${sign(wDelta)}${wDelta})`,
    `Об'єм: ${round(first.volume)} → ${round(last.volume)} кг×повт (${sign(volPct)}${volPct}%)`,
    `Найкраще: ${bestWeight} кг, об'єм ${round(bestVolume)} кг×повт`,
  ].join("\n");
}

export function trainingStats(action: TrainingStatsAction): ChatActionResult {
  const days = clampDays(action.input.period_days, 30);
  const top = clamp(action.input.top, 8, 20);
  const completed = completedSince(days);

  if (completed.length === 0) {
    return `Немає завершених тренувань за останні ${days} днів.`;
  }

  const perWeek = completed.length / Math.max(1, days / 7);
  const exerciseFreq = new Map<string, number>();
  const muscleFreq = new Map<string, number>();
  let totalSets = 0;
  for (const w of completed) {
    for (const item of w.items) {
      exerciseFreq.set(item.nameUk, (exerciseFreq.get(item.nameUk) ?? 0) + 1);
      totalSets += (item.sets ?? []).length;
      for (const m of item.musclesPrimary) {
        muscleFreq.set(m, (muscleFreq.get(m) ?? 0) + 1);
      }
    }
  }

  const topList = (m: Map<string, number>): string =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([k, v]) => `${k} (${v})`)
      .join(", ");

  return [
    `Статистика тренувань за ${days} днів:`,
    `Тренувань: ${completed.length} (~${perWeek.toFixed(1)}/тиждень), підходів: ${totalSets}`,
    `Топ вправи: ${topList(exerciseFreq) || "—"}`,
    `Топ м'язи: ${topList(muscleFreq) || "—"}`,
  ].join("\n");
}

/**
 * Доменний router для read-only fizruk query-tools. Повертає `undefined` для
 * нерелевантних дій, щоб `hubChatActions.dispatch` пішов далі по ланцюгу.
 */
export function handleQueryFizrukAction(
  action: ChatAction,
): ChatActionResult | undefined {
  switch (action.name) {
    case "query_workouts":
      return queryWorkouts(action as QueryWorkoutsAction);
    case "exercise_progress":
      return exerciseProgress(action as ExerciseProgressAction);
    case "training_stats":
      return trainingStats(action as TrainingStatsAction);
    default:
      return undefined;
  }
}
