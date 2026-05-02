import { safeReadLS } from "@shared/lib/storage";
import { ls, lsSet } from "../hubChatUtils";
import type {
  PlanWorkoutAction,
  LogSetAction,
  StartWorkoutAction,
  FinishWorkoutAction,
  LogMeasurementAction,
  AddProgramDayAction,
  LogWellbeingAction,
  SuggestWorkoutAction,
  CopyWorkoutAction,
  CompareProgressAction,
  WeightChartAction,
  Calculate1rmAction,
  WorkoutSet,
  WorkoutItem,
  Workout,
  ChatAction,
  ChatActionResult,
} from "./types";

function readWorkouts(): Workout[] {
  const parsed = safeReadLS<unknown>("fizruk_workouts_v1", null);
  if (Array.isArray(parsed)) return parsed as Workout[];
  if (
    parsed &&
    typeof parsed === "object" &&
    "workouts" in parsed &&
    Array.isArray((parsed as { workouts: unknown }).workouts)
  ) {
    return (parsed as { workouts: Workout[] }).workouts;
  }
  return [];
}

export function handleFizrukAction(
  action: ChatAction,
): ChatActionResult | undefined {
  switch (action.name) {
    case "plan_workout": {
      const { date, time, note, exercises } =
        (action as PlanWorkoutAction).input || {};
      const now = new Date();
      const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      const targetDate =
        date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
      const timeStr =
        time && /^\d{1,2}:\d{2}$/.test(String(time).trim())
          ? String(time).trim().padStart(5, "0")
          : "09:00";
      const startedAt = new Date(`${targetDate}T${timeStr}:00`).toISOString();
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
    case "log_set": {
      const { exercise_name, weight_kg, reps, sets } = (action as LogSetAction)
        .input;
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

      const activeId = ls<string | null>("fizruk_active_workout_id_v1", null);
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
          ...workouts[targetIdx],
          items: [...workouts[targetIdx].items],
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
        const item = { ...workout.items[itemIdx] };
        item.sets = [...item.sets, ...newSets];
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
    case "start_workout": {
      const { note, date, time } = (action as StartWorkoutAction).input || {};
      const now = new Date();
      const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      const targetDate =
        date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
      const timeStr =
        time && /^\d{1,2}:\d{2}$/.test(String(time).trim())
          ? String(time).trim().padStart(5, "0")
          : `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const startedAt = new Date(`${targetDate}T${timeStr}:00`).toISOString();
      const existingActiveId = ls<string | null>(
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
    case "finish_workout": {
      const { workout_id } = (action as FinishWorkoutAction).input || {};
      const activeId = ls<string | null>("fizruk_active_workout_id_v1", null);
      const workouts = readWorkouts();
      const targetId =
        (workout_id && String(workout_id).trim()) ||
        activeId ||
        workouts.find((w) => !w.endedAt)?.id ||
        "";
      if (!targetId) return "Немає активного тренування для завершення.";
      const idx = workouts.findIndex((w) => w.id === targetId);
      if (idx < 0) return `Тренування ${targetId} не знайдено.`;
      if (workouts[idx].endedAt) {
        if (activeId === targetId) lsSet("fizruk_active_workout_id_v1", null);
        return `Тренування ${targetId} вже завершено.`;
      }
      workouts[idx] = {
        ...workouts[idx],
        endedAt: new Date().toISOString(),
      };
      lsSet("fizruk_workouts_v1", { schemaVersion: 1, workouts });
      if (activeId === targetId) lsSet("fizruk_active_workout_id_v1", null);
      const setsCount = workouts[idx].items.reduce(
        (acc, it) => acc + (Array.isArray(it.sets) ? it.sets.length : 0),
        0,
      );
      return `Тренування завершено (id:${targetId}), підходів: ${setsCount}`;
    }
    case "log_measurement": {
      const input = (action as LogMeasurementAction).input || {};
      const keyMap: Record<string, string> = {
        weight_kg: "weightKg",
        body_fat_pct: "bodyFatPct",
        neck_cm: "neckCm",
        chest_cm: "chestCm",
        waist_cm: "waistCm",
        hips_cm: "hipsCm",
        bicep_l_cm: "bicepLCm",
        bicep_r_cm: "bicepRCm",
        forearm_l_cm: "forearmLCm",
        forearm_r_cm: "forearmRCm",
        thigh_l_cm: "thighLCm",
        thigh_r_cm: "thighRCm",
        calf_l_cm: "calfLCm",
        calf_r_cm: "calfRCm",
      };
      const entry: Record<string, number | string> = {
        id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
      };
      const changed: string[] = [];
      for (const [src, dst] of Object.entries(keyMap)) {
        const v = input[src];
        if (v != null && v !== "") {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) {
            entry[dst] = n;
            changed.push(`${dst}=${n}`);
          }
        }
      }
      if (changed.length === 0)
        return "Немає жодного валідного поля для заміру.";
      const existing = ls<Array<Record<string, unknown>>>(
        "fizruk_measurements_v1",
        [],
      );
      lsSet("fizruk_measurements_v1", [entry, ...existing]);
      return `Заміри записано: ${changed.join(", ")}`;
    }
    case "add_program_day": {
      const { weekday, name, exercises } = (action as AddProgramDayAction)
        .input;
      const wd = Number(weekday);
      if (!Number.isInteger(wd) || wd < 0 || wd > 6)
        return "weekday має бути цілим 0..6.";
      const dayName = (name || "").trim();
      if (!dayName) return "Потрібна назва тренування.";
      const exList: Array<{
        name: string;
        sets?: number;
        reps?: number;
        weight?: number;
      }> = [];
      if (Array.isArray(exercises)) {
        for (const ex of exercises) {
          if (!ex || typeof ex !== "object") continue;
          const exName = String(ex.name || "").trim();
          if (!exName) continue;
          const setsN = Number(ex.sets);
          const repsN = Number(ex.reps);
          const weightN = Number(ex.weight);
          exList.push({
            name: exName,
            sets: Number.isFinite(setsN) && setsN > 0 ? setsN : undefined,
            reps: Number.isFinite(repsN) && repsN > 0 ? repsN : undefined,
            weight:
              Number.isFinite(weightN) && weightN >= 0 ? weightN : undefined,
          });
        }
      }
      const tpl = ls<{
        schemaVersion?: number;
        days?: Record<string, { name: string; exercises: unknown[] }>;
      }>("fizruk_plan_template_v1", {});
      const days = { ...(tpl.days || {}) };
      days[String(wd)] = { name: dayName, exercises: exList };
      lsSet("fizruk_plan_template_v1", { schemaVersion: 1, days });
      const weekdayLabels = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
      return `День "${dayName}" (${weekdayLabels[wd]}) збережено: ${exList.length} вправ.`;
    }
    case "log_wellbeing": {
      const input = (action as LogWellbeingAction).input || {};
      const entry: Record<string, number | string | null> = {
        id: `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        weightKg: null,
        sleepHours: null,
        energyLevel: null,
        moodScore: null,
        note: "",
      };
      const parts: string[] = [];
      const weight = Number(input.weight_kg);
      if (Number.isFinite(weight) && weight > 0) {
        entry.weightKg = weight;
        parts.push(`вага ${weight} кг`);
      }
      const sleep = Number(input.sleep_hours);
      if (Number.isFinite(sleep) && sleep >= 0 && sleep <= 24) {
        entry.sleepHours = sleep;
        parts.push(`сон ${sleep} год`);
      }
      const energy = Number(input.energy_level);
      if (Number.isFinite(energy) && energy >= 1 && energy <= 5) {
        entry.energyLevel = Math.round(energy);
        parts.push(`енергія ${Math.round(energy)}/5`);
      }
      const mood = Number(input.mood_score);
      if (Number.isFinite(mood) && mood >= 1 && mood <= 5) {
        entry.moodScore = Math.round(mood);
        parts.push(`настрій ${Math.round(mood)}/5`);
      }
      if (input.note && String(input.note).trim()) {
        entry.note = String(input.note).trim().slice(0, 500);
      }
      if (parts.length === 0 && !entry.note)
        return "Немає жодного валідного поля для самопочуття.";
      const existing = ls<Array<Record<string, unknown>>>(
        "fizruk_daily_log_v1",
        [],
      );
      lsSet("fizruk_daily_log_v1", [entry, ...existing]);
      const entryId = entry.id as string;
      return {
        result: `Самопочуття записано${parts.length ? ": " + parts.join(", ") : ""}.`,
        undo: () => {
          const cur = ls<Array<Record<string, unknown>>>(
            "fizruk_daily_log_v1",
            [],
          );
          const next = cur.filter((e) => e.id !== entryId);
          if (next.length !== cur.length) lsSet("fizruk_daily_log_v1", next);
        },
      };
    }
    case "suggest_workout": {
      const { focus } = (action as SuggestWorkoutAction).input || {};
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
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
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
      return (
        parts.join(". ") + ". Рекомендацію сформовано на основі цих даних."
      );
    }
    case "copy_workout": {
      const { source_workout_id, date } =
        (action as CopyWorkoutAction).input || {};
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
      const targetDate =
        date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
      const wid = `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const copiedItems: WorkoutItem[] = source.items.map((item, i) => ({
        ...item,
        id: `i_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        sets: item.sets.map((s) => ({ ...s })),
      }));
      const newW: Workout = {
        id: wid,
        startedAt: new Date(
          `${targetDate}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`,
        ).toISOString(),
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
    case "compare_progress": {
      const { exercise_name, muscle_group, period_days } =
        (action as CompareProgressAction).input || {};
      const days = Number(period_days) || 30;
      const workouts = readWorkouts();
      const completed = workouts.filter((w) => w.endedAt);
      if (completed.length === 0)
        return "Немає завершених тренувань для аналізу.";
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
                  item.sets.reduce(
                    (ss, set) => ss + set.weightKg * set.reps,
                    0,
                  ),
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
    // ── Фінік v2 ───────────────────────────────────────────────
    case "weight_chart": {
      const { period_days } = (action as WeightChartAction).input || {};
      const days = Number(period_days) || 30;
      const log = ls<Array<{ at?: string; weightKg?: number | null }>>(
        "fizruk_daily_log_v1",
        [],
      );
      const cutoff = Date.now() - days * 86400000;
      const entries = log
        .filter(
          (e) =>
            e.weightKg != null && e.at && new Date(e.at).getTime() >= cutoff,
        )
        .sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime());
      if (entries.length === 0)
        return `Немає записів ваги за останні ${days} днів.`;
      const weights = entries.map((e) => e.weightKg as number);
      const min = Math.min(...weights);
      const max = Math.max(...weights);
      const first = weights[0];
      const last = weights[weights.length - 1];
      const diff = last - first;
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
    case "calculate_1rm": {
      const { weight_kg, reps, exercise_name } = (action as Calculate1rmAction)
        .input;
      const w = Number(weight_kg);
      const r = Number(reps);
      if (!Number.isFinite(w) || w <= 0)
        return "Вага має бути додатним числом.";
      if (!Number.isInteger(r) || r < 1)
        return "Повторення мають бути цілим числом >= 1.";
      if (r === 1) {
        return `1RM${exercise_name ? ` (${exercise_name})` : ""}: ${w} кг (1 повторення = вже максимум)`;
      }
      const epley = Math.round(w * (1 + r / 30) * 10) / 10;
      const brzycki = Math.round(((w * 36) / (37 - r)) * 10) / 10;
      const avg1rm = Math.round(((epley + brzycki) / 2) * 10) / 10;
      const percentages = [
        { pct: 100, reps: 1 },
        { pct: 95, reps: 2 },
        { pct: 90, reps: 4 },
        { pct: 85, reps: 6 },
        { pct: 80, reps: 8 },
        { pct: 75, reps: 10 },
        { pct: 70, reps: 12 },
        { pct: 65, reps: 15 },
      ];
      const parts: string[] = [
        `1RM${exercise_name ? ` (${exercise_name})` : ""}: ~${avg1rm} кг`,
        `Епллі: ${epley} кг | Бжицкі: ${brzycki} кг`,
        `Базується на: ${w} кг × ${r} повт`,
        "",
        "Таблиця відсотків:",
      ];
      for (const p of percentages) {
        parts.push(
          `  ${p.pct}% = ${Math.round((avg1rm * p.pct) / 100)} кг (~${p.reps} повт)`,
        );
      }
      return parts.join("\n");
    }
    default:
      return undefined;
  }
}
