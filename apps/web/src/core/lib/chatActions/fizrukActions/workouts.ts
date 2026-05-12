import { safeReadStringLS, safeRemoveLS } from "@shared/lib/storage/storage";
import { lsSet } from "../../hubChatUtils";
import { readWorkouts } from "./shared";
import type {
  PlanWorkoutAction,
  LogSetAction,
  StartWorkoutAction,
  FinishWorkoutAction,
  CopyWorkoutAction,
  WorkoutSet,
  WorkoutItem,
  Workout,
  ChatActionResult,
} from "../types";

export function planWorkout(action: PlanWorkoutAction): ChatActionResult {
  const { date, time, note, exercises } = action.input || {};
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const timeStr =
    time && /^\d{1,2}:\d{2}$/.test(String(time).trim())
      ? String(time).trim().padStart(5, "0")
      : "09:00";
  const startedAtTs = Date.parse(`${targetDate}T${timeStr}:00`);
  if (!Number.isFinite(startedAtTs)) {
    return "Некоректна дата або час.";
  }
  const startedAt = new Date(startedAtTs).toISOString();
  const wid = `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const items: WorkoutItem[] = Array.isArray(exercises)
    ? exercises
        .filter((ex) => ex && ex.name)
        .map((ex, i) => {
          const setsN = Math.max(1, Math.min(20, Number(ex.sets) || 3));
          const reps =
            ex.reps != null && Number.isFinite(Number(ex.reps))
              ? Number(ex.reps)
              : 0;
          const weightKg =
            ex.weight != null && Number.isFinite(Number(ex.weight))
              ? Number(ex.weight)
              : 0;
          const sets: WorkoutSet[] = Array.from({ length: setsN }, () => ({
            weightKg,
            reps,
          }));
          return {
            id: `i_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            nameUk: String(ex.name).trim(),
            type: "strength",
            musclesPrimary: [],
            musclesSecondary: [],
            sets,
            durationSec: 0,
            distanceM: 0,
          };
        })
    : [];
  const newW: Workout = {
    id: wid,
    startedAt,
    endedAt: null,
    items,
    groups: [],
    warmup: null,
    cooldown: null,
    note: note ? String(note).trim() : "",
    planned: true,
  };
  const existing = readWorkouts();
  lsSet("fizruk_workouts_v1", {
    schemaVersion: 1,
    workouts: [newW, ...existing],
  });
  const exCount = items.length;
  return `Тренування заплановано на ${targetDate} о ${timeStr}${note ? ` ("${note}")` : ""}: ${exCount} вправ${exCount === 1 ? "а" : exCount >= 2 && exCount <= 4 ? "и" : ""} (id:${wid})`;
}

export function logSet(action: LogSetAction): ChatActionResult {
  const { exercise_name, weight_kg, reps, sets } = action.input;
  const exName = (exercise_name || "").trim();
  if (!exName) return "Потрібна назва вправи для підходу.";
  const repsN = Number(reps);
  if (!Number.isFinite(repsN) || repsN <= 0) {
    return "Некоректна кількість повторень.";
  }
  const weightN = Number(weight_kg);
  const weightKg = Number.isFinite(weightN) && weightN >= 0 ? weightN : 0;
  const setsN = Math.max(1, Math.min(20, Number(sets) || 1));
  const newSets: WorkoutSet[] = Array.from({ length: setsN }, () => ({
    weightKg,
    reps: repsN,
  }));

  let workouts = readWorkouts();

  const activeId = safeReadStringLS("fizruk_active_workout_id_v1", null);
  const exerciseNameLower = exName.toLowerCase();

  let targetIdx = -1;
  if (activeId) {
    targetIdx = workouts.findIndex((w) => w.id === activeId);
  }
  if (targetIdx < 0) {
    targetIdx = workouts.findIndex((w) => !w.endedAt);
  }

  let workout: Workout;
  let created = false;
  if (targetIdx >= 0) {
    workout = {
      ...workouts[targetIdx]!,
      items: [...workouts[targetIdx]!.items],
    };
  } else {
    created = true;
    workout = {
      id: `w_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      startedAt: new Date().toISOString(),
      endedAt: null,
      items: [],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
      planned: false,
    };
  }

  const itemIdx = workout.items.findIndex(
    (it) => it.nameUk.trim().toLowerCase() === exerciseNameLower,
  );
  if (itemIdx >= 0) {
    const item = { ...workout.items[itemIdx]! };
    item.sets = [...item.sets!, ...newSets];
    workout.items[itemIdx] = item;
  } else {
    workout.items.push({
      id: `i_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      nameUk: exName,
      type: "strength",
      musclesPrimary: [],
      musclesSecondary: [],
      sets: newSets,
      durationSec: 0,
      distanceM: 0,
    });
  }

  if (created) {
    workouts = [workout, ...workouts];
    lsSet("fizruk_active_workout_id_v1", workout.id);
  } else {
    workouts[targetIdx] = workout;
  }
  lsSet("fizruk_workouts_v1", {
    schemaVersion: 1,
    workouts,
  });

  const weightLabel = weightKg > 0 ? `${weightKg} кг × ` : "";
  const setsLabel =
    setsN === 1 ? "1 підхід" : `${setsN} підходи${setsN >= 5 ? "в" : ""}`;
  const prefix = created ? "Нове тренування розпочато. " : "";
  return `${prefix}Додано ${setsLabel} "${exName}": ${weightLabel}${repsN} повторень`;
}

export function startWorkout(action: StartWorkoutAction): ChatActionResult {
  const { note, date, time } = action.input || {};
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const timeStr =
    time && /^\d{1,2}:\d{2}$/.test(String(time).trim())
      ? String(time).trim().padStart(5, "0")
      : `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const startedAtTs = Date.parse(`${targetDate}T${timeStr}:00`);
  if (!Number.isFinite(startedAtTs)) {
    return "Некоректна дата або час.";
  }
  const startedAt = new Date(startedAtTs).toISOString();
  const existingActiveId = safeReadStringLS(
    "fizruk_active_workout_id_v1",
    null,
  );
  const workouts = readWorkouts();
  if (
    existingActiveId &&
    workouts.some((w) => w.id === existingActiveId && !w.endedAt)
  ) {
    return `Вже є активне тренування (id:${existingActiveId}). Спочатку заверши його (finish_workout).`;
  }
  const wid = `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const newW: Workout = {
    id: wid,
    startedAt,
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: note ? String(note).trim() : "",
    planned: false,
  };
  lsSet("fizruk_workouts_v1", {
    schemaVersion: 1,
    workouts: [newW, ...workouts],
  });
  lsSet("fizruk_active_workout_id_v1", wid);
  return `Тренування розпочато о ${timeStr}${note ? ` ("${String(note).trim()}")` : ""} (id:${wid})`;
}

export function finishWorkout(action: FinishWorkoutAction): ChatActionResult {
  const { workout_id } = action.input || {};
  const activeId = safeReadStringLS("fizruk_active_workout_id_v1", null);
  const workouts = readWorkouts();
  const targetId =
    (workout_id && String(workout_id).trim()) ||
    activeId ||
    workouts.find((w) => !w.endedAt)?.id ||
    "";
  if (!targetId) return "Немає активного тренування для завершення.";
  const idx = workouts.findIndex((w) => w.id === targetId);
  if (idx < 0) return `Тренування ${targetId} не знайдено.`;
  if (workouts[idx]!.endedAt) {
    if (activeId === targetId) safeRemoveLS("fizruk_active_workout_id_v1");
    return `Тренування ${targetId} вже завершено.`;
  }
  workouts[idx] = {
    ...workouts[idx]!,
    endedAt: new Date().toISOString(),
  };
  lsSet("fizruk_workouts_v1", { schemaVersion: 1, workouts });
  if (activeId === targetId) safeRemoveLS("fizruk_active_workout_id_v1");
  const setsCount = workouts[idx]!.items.reduce(
    (acc, it) => acc + (Array.isArray(it.sets) ? it.sets.length : 0),
    0,
  );
  return `Тренування завершено (id:${targetId}), підходів: ${setsCount}`;
}

export function copyWorkout(action: CopyWorkoutAction): ChatActionResult {
  const { source_workout_id, date } = action.input || {};
  const workouts = readWorkouts();
  let source: Workout | undefined;
  if (source_workout_id) {
    source = workouts.find((w) => w.id === source_workout_id);
    if (!source) return `Тренування ${source_workout_id} не знайдено.`;
  } else {
    source = workouts
      .filter((w) => w.endedAt)
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      )[0];
    if (!source) return "Немає завершених тренувань для копіювання.";
  }
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const copyTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const copyStartedAtTs = Date.parse(`${targetDate}T${copyTimeStr}:00`);
  if (!Number.isFinite(copyStartedAtTs)) {
    return "Некоректна дата.";
  }
  const wid = `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const copiedItems: WorkoutItem[] = source.items.map((item, i) => ({
    ...item,
    id: `i_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 6)}`,
    sets: item.sets.map((s) => ({ ...s })),
  }));
  const newW: Workout = {
    id: wid,
    startedAt: new Date(copyStartedAtTs).toISOString(),
    endedAt: null,
    items: copiedItems,
    groups: [],
    warmup: null,
    cooldown: null,
    note: source.note ? `Копія: ${source.note}` : "",
    planned: true,
  };
  lsSet("fizruk_workouts_v1", {
    schemaVersion: 1,
    workouts: [newW, ...workouts],
  });
  return `Тренування скопійовано (${source.items.length} вправ) на ${targetDate} (id:${wid})`;
}
