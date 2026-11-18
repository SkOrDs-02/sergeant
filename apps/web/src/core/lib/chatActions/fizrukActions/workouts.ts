import { safeReadStringLS, safeRemoveLS } from "@shared/lib/storage/storage";
import { lsSet } from "../../hubChatUtils";
import { MAX_WEIGHT_KG } from "@fizruk/lib/numericBounds";
import { currentExerciseMeasurePrefs } from "@fizruk/lib/exerciseMeasurePrefsCache";
import { formatMeasureSets } from "@fizruk/lib/measureFormat";
import {
  deviceDayKey,
  formatNumberUk,
  pluralExercises,
} from "@sergeant/shared";
import {
  deleteFizrukWorkout,
  readFizrukWorkouts,
  persistFizrukWorkouts,
  persistFizrukCustomExercises,
} from "./shared";
import {
  buildWorkoutItemFromExercise,
  createChatExerciseResolver,
} from "./exerciseResolve";
import {
  buildChatSets,
  measureForChatSet,
  measureForPlan,
  parseChatSetValues,
  planExistingItem,
} from "./setMeasure";
import {
  buildPlannedSets,
  type Workout,
  type WorkoutItem,
  type WorkoutSet,
} from "@sergeant/fizruk-domain";
import {
  measureCountsBy,
  measureFields,
  measureToItemType,
  resolveExerciseMeasure,
  withMeasureMirror,
  type ExerciseMeasure,
} from "@sergeant/fizruk-domain/domain";
import type {
  PlanWorkoutAction,
  LogSetAction,
  StartWorkoutAction,
  FinishWorkoutAction,
  CopyWorkoutAction,
  ChatActionResult,
} from "../types";

// AI-CONTEXT: `fizruk_workouts_v1` is tombstoned (#057f) — `useWorkouts` reads
// the SQLite warm-cache, so these mutators read/write via `readFizrukWorkouts`/
// `persistFizrukWorkouts` (dual-write). `fizruk_active_workout_id_v1` stays on
// plain LS: it sits OUTSIDE the dual-write pipeline and `useWorkoutsOrchestrator`
// resolves it against the SQLite-backed `useWorkouts` list, so an LS scalar + a
// SQLite workout list stay consistent.
const ACTIVE_KEY = "fizruk_active_workout_id_v1";

/**
 * Мітка часу для стінного годинника ПРИСТРОЮ: день-ключ + `HH:MM`.
 *
 * AI-CONTEXT: заплановане тренування — особиста сутність (ADR-0078): день
 * і година належать годиннику пристрою, як у формі тренування модуля
 * (`Workouts.helpers.ts`, рішення власника 2026-09-29) і як у чат-виконавці
 * Рутини. До 2026-11-18 `plan_workout` брав київський годинник: на пристрої
 * поза Києвом план «на 07:00» лягав на іншу годину, а після київської
 * півночі ще й на інший день. З того ж дня на цьому годиннику і
 * `start_workout` та `copy_workout`, разом із рядками контексту
 * «[Сьогодні]» / «[Зараз] … (час пристрою)» (`hubChatContext/finance.ts`):
 * модель і виконавець бачать той самий годинник.
 *
 * `NaN` на неможливій даті (2026-02-30) чи годині (24:00): викликач віддає
 * «Некоректна дата або час», а не мовчки пише сміття.
 */
function deviceWallClockTs(dayKey: string, hhmm: string): number {
  const [y = NaN, mo = NaN, d = NaN] = dayKey.split("-").map(Number);
  const [rawH, rawM] = hhmm.split(":");
  const hours = Number(rawH);
  const minutes = Number(rawM);
  if (![y, mo, d, hours, minutes].every((n) => Number.isFinite(n))) return NaN;
  if (hours > 23 || minutes > 59) return NaN;
  const at = new Date(y, mo - 1, d, hours, minutes, 0, 0);
  // Календарно неможлива дата перекотилась би на наступний місяць.
  if (deviceDayKey(at) !== dayKey) return NaN;
  return at.getTime();
}

/** Поточна година пристрою як `HH:MM` (ADR-0078). */
function deviceNowHHMM(): string {
  const now = new Date();
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: тренування — особиста сутність, година за годинником пристрою, як у формі модуля
  const h = now.getHours();
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- те саме
  const m = now.getMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function planWorkout(action: PlanWorkoutAction): ChatActionResult {
  const { date, time, note, exercises } = action.input || {};
  const today = deviceDayKey();
  const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const timeStr =
    time && /^\d{1,2}:\d{2}$/.test(String(time).trim())
      ? String(time).trim().padStart(5, "0")
      : "09:00";
  const startedAtTs = deviceWallClockTs(targetDate, timeStr);
  if (!Number.isFinite(startedAtTs)) {
    return "Некоректна дата або час.";
  }
  const startedAt = new Date(startedAtTs).toISOString();
  const wid = `w_${Date.now().toString(36)}_${crypto.randomUUID()}`;
  // data-11: кожна вправа плану отримує справжній `exerciseId` (каталог або
  // нова custom-вправа) — порожній id сервер відхиляє як missing_exercise_id.
  const resolver = createChatExerciseResolver();
  const prefs = currentExerciseMeasurePrefs();
  const items: WorkoutItem[] = Array.isArray(exercises)
    ? exercises
        .filter((ex) => ex && ex.name)
        .map((ex, i) => {
          const setsN = Math.max(1, Math.min(20, Number(ex.sets) || 3));
          const weightKg =
            ex.weight != null && Number.isFinite(Number(ex.weight))
              ? Number(ex.weight)
              : 0;
          const seconds = Number(ex.seconds);
          const def = resolver.resolve(String(ex.name).trim());
          // Тип: памʼять людини → дефолт каталогу; секунди в запиті ставлять
          // тип «на час» (спека типу виміру, зріз 7). Памʼять не пишеться.
          const measure = measureForPlan(
            resolveExerciseMeasure(def, prefs),
            Number.isFinite(seconds) ? seconds : 0,
            weightKg,
          );
          // logic-18: план сіє НЕзараховані рядки (`reps: 0`), як старт
          // програми. Повтори й секунди з запиту в рядок не пишуться: рядок із
          // ними вже «виконаний підхід» (`isSetCompleted`), а поля плану у
          // `WorkoutItem` немає (`ProgramSessionDef.plan` — каталог програми).
          const sets = buildPlannedSets(
            setsN,
            measureFields(measure).weight ? weightKg : 0,
          );
          return withMeasureMirror(
            withMeasure(
              buildWorkoutItemFromExercise(
                def,
                `i_${Date.now().toString(36)}_${i}_${crypto.randomUUID()}`,
                sets,
              ),
              measure,
            ),
          );
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
  // Custom-вправи — ДО тренування: outbox отримає їх раніше за items.
  persistFizrukCustomExercises(resolver.created);
  persistFizrukWorkouts([newW, ...readFizrukWorkouts()]);
  const exCount = items.length;
  // Модель не має переказати «3×10 записано»: повтори й секунди з запиту не
  // зберігаються.
  const asked = (key: "reps" | "seconds") =>
    Array.isArray(exercises) && exercises.some((ex) => ex?.[key] != null);
  const notStored = [
    asked("reps") ? "Повтори" : "",
    asked("seconds") ? "секунди" : "",
  ]
    .filter(Boolean)
    .join(" й ");
  const repsNote = notStored
    ? `. ${notStored.charAt(0).toUpperCase()}${notStored.slice(1)} в план не записуються: підхід зараховується, коли його зроблять`
    : "";
  return `Тренування заплановано на ${targetDate} о ${timeStr}${note ? ` ("${note}")` : ""}: ${exCount} вправ${exCount === 1 ? "а" : exCount >= 2 && exCount <= 4 ? "и" : ""} (id:${wid})${repsNote}`;
}

/** Явний тип виміру й похідний старий `type` (дзеркало ставить викликач). */
function withMeasure(item: WorkoutItem, measure: ExerciseMeasure): WorkoutItem {
  return { ...item, measure, type: measureToItemType(measure) };
}

export function logSet(action: LogSetAction): ChatActionResult {
  const { exercise_name, weight_kg, sets } = action.input;
  const exName = (exercise_name || "").trim();
  if (!exName) return "Потрібна назва вправи для підходу.";
  const weightN = Number(weight_kg);
  const weightKg = Number.isFinite(weightN) && weightN >= 0 ? weightN : 0;
  if (weightKg > MAX_WEIGHT_KG) {
    return `Вага підходу занадто велика (максимум ${formatNumberUk(MAX_WEIGHT_KG)} кг). Перевір число і спробуй ще раз.`;
  }
  // Хоч одне з reps / duration_sec / distance_m (спека типу виміру, зріз 7):
  // схема цього не виражає, тож перевірка тут, до будь-якого запису.
  const parsed = parseChatSetValues(action.input, weightKg);
  if (!parsed.ok) return parsed.error;
  const values = parsed.values;
  const setsN = Math.max(1, Math.min(20, Number(sets) || 1));

  const workouts = readFizrukWorkouts();
  const activeId = safeReadStringLS(ACTIVE_KEY, null);
  const exerciseNameLower = exName.toLowerCase();

  let targetIdx = -1;
  if (activeId) {
    targetIdx = workouts.findIndex((w) => w.id === activeId);
  }
  if (targetIdx < 0) {
    targetIdx = workouts.findIndex((w) => !w.endedAt);
  }

  const existingWorkout = targetIdx >= 0 ? workouts[targetIdx] : undefined;
  let created = false;
  let workout: Workout;
  if (existingWorkout) {
    workout = { ...existingWorkout, items: [...existingWorkout.items] };
  } else {
    created = true;
    workout = {
      id: `w_${Date.now().toString(36)}_${crypto.randomUUID()}`,
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

  // data-11: item мусить нести справжній `exerciseId` (каталог або custom).
  const resolver = createChatExerciseResolver();
  let resolved: ReturnType<typeof resolver.resolve> | null = null;
  let itemIdx = workout.items.findIndex(
    (it) => it.nameUk.trim().toLowerCase() === exerciseNameLower,
  );
  if (itemIdx < 0) {
    // Назву в тренуванні не знайшли — шукаємо ту саму вправу за id: людина
    // могла сказати «присідання», а в тренуванні вона «Присідання зі штангою».
    resolved = resolver.resolve(exName);
    const resolvedId = resolved.id;
    itemIdx = workout.items.findIndex((it) => it.exerciseId === resolvedId);
  }
  const existingItem = itemIdx >= 0 ? workout.items[itemIdx] : undefined;
  let measure: ExerciseMeasure;
  let newSets: WorkoutSet[];
  if (existingItem) {
    const plan = planExistingItem(existingItem, existingItem.nameUk, values);
    if (!plan.ok) return plan.error;
    measure = plan.measure;
    newSets = buildChatSets(measure, values, setsN);
    const base: WorkoutItem = plan.patch
      ? { ...existingItem, ...plan.patch }
      : existingItem;
    const next: WorkoutItem = {
      ...base,
      // Item зі старого чат-запису міг мати порожній id — лагодимо тут.
      exerciseId:
        existingItem.exerciseId || (resolved ?? resolver.resolve(exName)).id,
      sets: [...(base.sets ?? []), ...newSets],
    };
    workout.items[itemIdx] = withMeasureMirror(next);
  } else {
    const def = resolved ?? resolver.resolve(exName);
    // Тип нової вправи: памʼять людини → дефолт каталогу, а якщо дані його
    // не вміщують — тип із даних. Памʼять чат не пише.
    measure = measureForChatSet(
      resolveExerciseMeasure(def, currentExerciseMeasurePrefs()),
      values,
    );
    newSets = buildChatSets(measure, values, setsN);
    workout.items.push(
      withMeasureMirror(
        withMeasure(
          buildWorkoutItemFromExercise(
            def,
            `i_${Date.now().toString(36)}_${crypto.randomUUID()}`,
            newSets,
          ),
          measure,
        ),
      ),
    );
  }

  let nextWorkouts: Workout[];
  if (created) {
    nextWorkouts = [workout, ...workouts];
    lsSet(ACTIVE_KEY, workout.id);
  } else {
    nextWorkouts = workouts.slice();
    nextWorkouts[targetIdx] = workout;
  }
  // Custom-вправа — ДО тренування: outbox отримає її раніше за item.
  persistFizrukCustomExercises(resolver.created);
  persistFizrukWorkouts(nextWorkouts);

  const setsLabel =
    setsN === 1 ? "1 підхід" : `${setsN} підходи${setsN >= 5 ? "в" : ""}`;
  const prefix = created ? "Нове тренування розпочато. " : "";
  if (measureCountsBy(measure) !== "reps") {
    // «3 × 30 с», «400 м», «2 × 40 м · 24 кг» — формат підсумку сесії.
    const summary = formatMeasureSets({
      measure,
      type: measureToItemType(measure),
      sets: newSets,
    });
    return `${prefix}Додано ${setsLabel} "${exName}": ${summary}`;
  }
  const shownWeight = measureFields(measure).weight ? values.weightKg : 0;
  const weightLabel =
    shownWeight > 0 ? `${formatNumberUk(shownWeight)} кг × ` : "";
  return `${prefix}Додано ${setsLabel} "${exName}": ${weightLabel}${values.reps} повторень`;
}

export function startWorkout(action: StartWorkoutAction): ChatActionResult {
  const { note, date, time } = action.input || {};
  const today = deviceDayKey();
  const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const timeStr =
    time && /^\d{1,2}:\d{2}$/.test(String(time).trim())
      ? String(time).trim().padStart(5, "0")
      : deviceNowHHMM();
  const startedAtTs = deviceWallClockTs(targetDate, timeStr);
  if (!Number.isFinite(startedAtTs)) {
    return "Некоректна дата або час.";
  }
  const startedAt = new Date(startedAtTs).toISOString();
  const existingActiveId = safeReadStringLS(ACTIVE_KEY, null);
  const workouts = readFizrukWorkouts();
  if (
    existingActiveId &&
    workouts.some((w) => w.id === existingActiveId && !w.endedAt)
  ) {
    return `Вже є активне тренування (id:${existingActiveId}). Спочатку заверши його (finish_workout).`;
  }
  const wid = `w_${Date.now().toString(36)}_${crypto.randomUUID()}`;
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
  persistFizrukWorkouts([newW, ...workouts]);
  lsSet(ACTIVE_KEY, wid);
  return `Тренування розпочато о ${timeStr}${note ? ` ("${String(note).trim()}")` : ""} (id:${wid})`;
}

export function finishWorkout(action: FinishWorkoutAction): ChatActionResult {
  const { workout_id } = action.input || {};
  const activeId = safeReadStringLS(ACTIVE_KEY, null);
  const workouts = readFizrukWorkouts();
  const targetId =
    (workout_id && String(workout_id).trim()) ||
    activeId ||
    workouts.find((w) => !w.endedAt)?.id ||
    "";
  if (!targetId) return "Немає активного тренування для завершення.";
  const idx = workouts.findIndex((w) => w.id === targetId);
  const target = idx >= 0 ? workouts[idx] : undefined;
  if (!target) return `Тренування не знайдено (id:${targetId}).`;
  if (target.endedAt) {
    if (activeId === targetId) safeRemoveLS(ACTIVE_KEY);
    return `Тренування вже завершено (id:${targetId}).`;
  }
  const finished: Workout = { ...target, endedAt: new Date().toISOString() };
  const nextWorkouts = workouts.slice();
  nextWorkouts[idx] = finished;
  persistFizrukWorkouts(nextWorkouts);
  if (activeId === targetId) safeRemoveLS(ACTIVE_KEY);
  const setsCount = finished.items.reduce(
    (acc, it) => acc + (Array.isArray(it.sets) ? it.sets.length : 0),
    0,
  );
  return `Тренування завершено (id:${targetId}), підходів: ${setsCount}`;
}

export function copyWorkout(action: CopyWorkoutAction): ChatActionResult {
  const { source_workout_id, date } = action.input || {};
  const workouts = readFizrukWorkouts();
  let source: Workout | undefined;
  if (source_workout_id) {
    source = workouts.find((w) => w.id === source_workout_id);
    if (!source) return `Тренування не знайдено (id:${source_workout_id}).`;
  } else {
    source = workouts
      .filter((w) => w.endedAt)
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      )[0];
    if (!source) return "Немає завершених тренувань для копіювання.";
  }
  const today = deviceDayKey();
  const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const copyStartedAtTs = deviceWallClockTs(targetDate, deviceNowHHMM());
  if (!Number.isFinite(copyStartedAtTs)) {
    return "Некоректна дата.";
  }
  const wid = `w_${Date.now().toString(36)}_${crypto.randomUUID()}`;
  // Item зі старого чат-запису міг лишитись із порожнім `exerciseId` —
  // не переносимо його далі, а резолвимо за назвою (data-11).
  const resolver = createChatExerciseResolver();
  const copiedItems: WorkoutItem[] = source.items.map((item, i) => ({
    ...item,
    exerciseId: item.exerciseId || resolver.resolve(item.nameUk).id,
    id: `i_${Date.now().toString(36)}_${i}_${crypto.randomUUID()}`,
    sets: (item.sets ?? []).map((s) => ({ ...s })),
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
  persistFizrukCustomExercises(resolver.created);
  persistFizrukWorkouts([newW, ...workouts]);
  const n = source.items.length;
  return {
    result: `Тренування скопійовано (${n} ${pluralExercises(n)}) на ${targetDate} (id:${wid})`,
    undo: () => deleteFizrukWorkout(newW),
  };
}
