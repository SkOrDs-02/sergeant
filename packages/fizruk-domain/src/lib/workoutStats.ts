/** Pure helpers for dashboard / analytics (kg, Kyiv-anchored week Mon–Sun). */

import { kyivCalendarDaysBetween, kyivMondayStartMs } from "@sergeant/shared";

interface StatsSet {
  weightKg?: number | null | undefined;
  reps?: number | null | undefined;
  [key: string]: unknown;
}

interface StatsItem {
  exerciseId?: string | null | undefined;
  type?: string | null | undefined;
  sets?: StatsSet[] | null | undefined;
  [key: string]: unknown;
}

interface StatsWorkout {
  startedAt?: string | null | undefined;
  endedAt?: string | null | undefined;
  items?: StatsItem[] | null | undefined;
  [key: string]: unknown;
}

/**
 * Формула Еплі для оцінки 1ПМ (1 повторний максимум).
 * Виноситься як публічна функція, щоб не дублюватись в Exercise.jsx і Progress.jsx.
 */
export const E1RM_REP_CAP = 10;

export function epley1rm(
  weightKg: number | null | undefined,
  reps: number | null | undefined,
): number {
  const wg = Number(weightKg) || 0;
  const r = Number(reps) || 0;
  if (wg <= 0 || r <= 0 || r > E1RM_REP_CAP) return 0;
  return wg * (1 + r / 30);
}

function roundToStep(x: number, step: number): number {
  const s = Number(step) || 1;
  return Math.round(x / s) * s;
}

export interface ExercisePRResult {
  best1rm: number;
  bestSet: { weightKg: number; reps: number } | null;
  date: string | null;
}

/**
 * Повертає особистий рекорд по вправі: { best1rm, bestSet: {weightKg, reps}, date }.
 * Враховує всі тренування у `workouts`.
 */
export function getExercisePR(
  workouts: readonly StatsWorkout[] | null | undefined,
  exerciseId: string,
): ExercisePRResult {
  let best1rm = 0;
  let bestSet: ExercisePRResult["bestSet"] = null;
  let bestDate: string | null = null;
  for (const w of workouts || []) {
    for (const it of w.items || []) {
      if (it.exerciseId !== exerciseId || it.type !== "strength") continue;
      for (const s of it.sets || []) {
        const est = epley1rm(s.weightKg, s.reps);
        if (est > best1rm) {
          best1rm = est;
          bestSet = {
            weightKg: Number(s.weightKg) || 0,
            reps: Number(s.reps) || 0,
          };
          bestDate = w.startedAt || null;
        }
      }
    }
  }
  return { best1rm, bestSet, date: bestDate };
}

export interface TargetRepRange {
  min: number;
  max: number;
}

/**
 * Цільові діапазони повторів. ⚠️ Інженерний дефолт, не рішення власника:
 * числа взяті як загальновживані орієнтири і живуть в одному місці саме
 * для того, щоб їх можна було змінити однією правкою.
 */
export const TARGET_REP_RANGES = {
  compound: { min: 5, max: 8 },
  accessory: { min: 8, max: 12 },
  isolation: { min: 10, max: 15 },
} as const satisfies Record<string, TargetRepRange>;

/** Групи, де рух односуглобовий і вага росте дрібними кроками. */
const ISOLATION_GROUPS = new Set([
  "biceps",
  "triceps",
  "forearms",
  "calves",
  "core",
]);

/** Групи, де крок 2.5 кг на штанзі надто дрібний, щоб щось означати. */
const LOWER_BODY_GROUPS = new Set([
  "quadriceps",
  "hamstrings",
  "glutes",
  "full_body",
]);

/** Мінімум із каталогу, потрібний для вибору діапазону й кроку. */
export interface ExerciseProgressionHint {
  equipment?: string[] | readonly string[] | null | undefined;
  primaryGroup?: string | null | undefined;
}

/** М'який режим повернення — форма зрізу `computeOneRmAging`. */
export interface ReturnModeHint {
  returnMode?: boolean | undefined;
  returnReason?: string | null | undefined;
  reductionPct?: number | undefined;
}

/**
 * Відповідь про готовність перед тренуванням. Обидві шкали 1-5, де **1 =
 * погано, 5 = добре** (`soreness` читається як «як почуваються мʼязи», а не
 * «наскільки болить», щоб напрямок збігався зі `sleep`).
 *
 * Мітки часу тут навмисно немає: відповідь лежить у `Workout.wellbeing` того
 * тренування, тож протухає формою даних, а не таймером. Через це
 * `suggestNextSet` лишається чистою і не потребує ані `new Date()`, ані
 * переданого ззовні `now`.
 */
export interface ReadinessAnswer {
  sleep?: number | null | undefined;
  soreness?: number | null | undefined;
}

export type ReadinessLevel = "low" | "neutral" | "high";

/** Межі, затверджені founder-ом 2026-09-02. */
export const READINESS_LOW_AT = 2;
export const READINESS_HIGH_AT = 4;

function readinessScore(value: number | null | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

/**
 * Правило найслабшої ланки: БУДЬ-ЯКА шкала ≤2 робить готовність низькою,
 * а високою вона стає лише коли ОБИДВІ ≥4.
 *
 * AI-CONTEXT: асиметрія навмисна і успадкована з `AI-DANGER` у
 * `suggestNextSet` — помилка «занизька вага» коштує одного легкого підходу,
 * «завищена» коштує травми. Тому один поганий сигнал уже дає підставу
 * ЗАПРОПОНУВАТИ легше, а пропозиція взяти більше вимагає згоди обох.
 * Наслідок для неповної відповіді: `{ sleep: 1 }` це `low`, а `{ sleep: 5 }`
 * (без `soreness`) лишається `neutral` — недомовка не підвищує навантаження.
 */
export function classifyReadiness(
  answer: ReadinessAnswer | null | undefined,
): ReadinessLevel {
  const sleep = readinessScore(answer?.sleep);
  const soreness = readinessScore(answer?.soreness);
  if (
    (sleep !== null && sleep <= READINESS_LOW_AT) ||
    (soreness !== null && soreness <= READINESS_LOW_AT)
  ) {
    return "low";
  }
  if (
    sleep !== null &&
    soreness !== null &&
    sleep >= READINESS_HIGH_AT &&
    soreness >= READINESS_HIGH_AT
  ) {
    return "high";
  }
  return "neutral";
}

export interface SuggestNextSetOptions {
  exercise?: ExerciseProgressionHint | null | undefined;
  aging?: ReturnModeHint | null | undefined;
  /** Відсутня чи нейтральна готовність лишає результат таким, як був. */
  readiness?: ReadinessAnswer | null | undefined;
}

/**
 * Діапазон повторів виводиться з каталогу, а не задається в програмі: одна
 * таблиця на весь домен замість ручного проходу по всіх сесіях усіх програм.
 */
export function targetRepRange(
  exercise: ExerciseProgressionHint | null | undefined,
): TargetRepRange {
  const group = String(exercise?.primaryGroup ?? "");
  if (ISOLATION_GROUPS.has(group)) return TARGET_REP_RANGES.isolation;
  const equipment = exercise?.equipment ?? [];
  const isBarbell = Array.from(equipment).includes("barbell");
  return isBarbell ? TARGET_REP_RANGES.compound : TARGET_REP_RANGES.accessory;
}

/** Крок ваги: 5 кг там, де працюють великі групи зі штангою, інакше 2.5. */
export function weightStepKg(
  exercise: ExerciseProgressionHint | null | undefined,
): number {
  const equipment = Array.from(exercise?.equipment ?? []);
  const heavy =
    equipment.includes("barbell") &&
    LOWER_BODY_GROUPS.has(String(exercise?.primaryGroup ?? ""));
  return heavy ? 5 : 2.5;
}

export interface SuggestedNextSetResult {
  weightKg: number;
  reps: number;
  altWeightKg?: number;
  altReps?: number;
  /** Діапазон, у межах якого росли повтори. */
  targetReps: TargetRepRange;
  /** Вага навмисно не піднімається — режим повернення. */
  softMode: boolean;
  /** `layoff` | `injury` — причина м'якого режиму, `null` коли його немає. */
  returnReason: string | null;
  /**
   * Полегшений варіант — рівно на крок ваги нижче за плановий, з повторами на
   * низу діапазону. Присутній ЛИШЕ при низькій готовності.
   */
  easedWeightKg?: number;
  easedReps?: number;
  /**
   * Що саме показує друга кнопка. Поля немає взагалі, коли готовність нічого
   * не сказала — так картка лишається однокнопковою, як була.
   */
  secondOption?: "easier" | "harder";
}

/**
 * Подвійна прогресія: спершу ростуть повтори в межах цільового діапазону,
 * після досягнення стелі додається вага і повтори повертаються на низ.
 *
 * AI-DANGER: у режимі повернення (пауза понад поріг або свіже зняття позначки
 * травми) підказка НЕ підвищує вагу — вона пропонує від зниженого орієнтира.
 * Це той самий контракт довіри тіла, що й `computeOneRmAging`: помилка
 * «занизька вага» коштує одного легкого підходу, «завищена» коштує травми.
 *
 * Це підказка, а не автомат: значення підставляється в поле і його можна
 * перебити. Повертає `null`, коли історії ще немає.
 *
 * Готовність (`options.readiness`) НЕ змінює плановий варіант — вона лише
 * додає другий. Нейтральна чи відсутня відповідь віддає рівно той самий
 * обʼєкт, що й до появи цієї опції.
 */
export function suggestNextSet(
  lastBestSet: StatsSet | null | undefined,
  options: SuggestNextSetOptions = {},
): SuggestedNextSetResult | null {
  const w = Number(lastBestSet?.weightKg) || 0;
  const r = Number(lastBestSet?.reps) || 0;
  if (w <= 0 || r <= 0) return null;

  const targetReps = targetRepRange(options.exercise);
  const step = weightStepKg(options.exercise);
  const aging = options.aging;
  const readiness = classifyReadiness(options.readiness);

  /**
   * Полегшення — рівно один крок ваги вниз, з підлогою в один крок, щоб
   * легка вправа не пішла в нуль чи мінус. Крок, а не відсоток: він уже
   * означає «наскільки ця вправа рухається за раз» (`weightStepKg`) і завжди
   * лягає на легальний набір млинців. `Math.min` тримає інваріант, заради
   * якого все й робиться: полегшений варіант НІКОЛИ не важчий за плановий.
   */
  const ease = (
    plannedWeight: number,
  ): Pick<
    SuggestedNextSetResult,
    "easedWeightKg" | "easedReps" | "secondOption"
  > => ({
    easedWeightKg: Math.min(
      plannedWeight,
      Math.max(step, roundToStep(plannedWeight - step, step)),
    ),
    easedReps: targetReps.min,
    secondOption: "easier",
  });

  if (aging?.returnMode) {
    const reduction = Math.max(0, Number(aging.reductionPct) || 0) / 100;
    const softWeight = roundToStep(w * (1 - reduction), step);
    // Округлення вгору до кроку не має права дати вагу БІЛЬШУ за минулу:
    // це рівно те підвищення, якого режим повернення уникає.
    const planned = Math.min(w, softWeight);
    return {
      weightKg: planned,
      reps: targetReps.min,
      targetReps,
      softMode: true,
      returnReason: aging.returnReason ?? null,
      // AI-DANGER: у режимі повернення «можна більше» не пропонується
      // НІКОЛИ, хай яка добра сьогодні готовність. Сенс режиму саме в тому,
      // щоб не піднімати вагу, і добре самопочуття після паузи чи травми —
      // не доказ, що тканина відновилась.
      ...(readiness === "low" ? ease(planned) : {}),
    };
  }

  if (r >= targetReps.max) {
    const planned = roundToStep(w + step, step);
    return {
      weightKg: planned,
      reps: targetReps.min,
      targetReps,
      softMode: false,
      returnReason: null,
      // «Важче» тут не пропонується: план і так піднімає вагу, а другий крок
      // угору за одну сесію — це вже не підказка, а стрибок.
      ...(readiness === "low" ? ease(planned) : {}),
    };
  }

  return {
    weightKg: w,
    reps: r + 1,
    altWeightKg: roundToStep(w + step, step),
    altReps: targetReps.min,
    targetReps,
    softMode: false,
    returnReason: null,
    ...(readiness === "low" ? ease(w) : {}),
    ...(readiness === "high" ? { secondOption: "harder" as const } : {}),
  };
}

/** Скільки полегшень поспіль означає «схоже, план завищений». */
export const EASING_STREAK_THRESHOLD = 3;

/**
 * Скільки разів ПОСПІЛЬ людина обрала полегшений варіант на цій вправі,
 * рахуючи від найсвіжішого заняття назад.
 *
 * Одиниця лічби — ПОЯВА ВПРАВИ у ЗАВЕРШЕНОМУ тренуванні, не підхід: три
 * полегшені підходи в одному занятті це один випадок, а не три.
 *
 * Що НЕ скидає лічильник: тренування, де цієї вправи не було (пропуск), і
 * незавершене тренування. Рахується послідовність появ вправи, а не
 * календар, тож перерва в тиждень стрічку не обнуляє — «погано спав» тричі
 * поспіль лишається сигналом і з паузами між заняттями.
 *
 * Що скидає: будь-який `planned` чи `harder` на цій вправі. Відсутнє
 * `chosenVariant` читається як `planned`, тож історія до появи готовності
 * стрічку обриває, а не продовжує.
 *
 * Значення ПОХІДНЕ і навмисно не зберігається: правка завершеного тренування
 * має одразу відбитись на лічильнику, а збережене число розійшлося б із тим,
 * що людина бачить в історії.
 */
export function countConsecutiveEasings(
  workouts: readonly StatsWorkout[] | null | undefined,
  exerciseId: string,
): number {
  if (!Array.isArray(workouts) || !exerciseId) return 0;
  const ordered = [...workouts]
    .filter((wk) => Boolean(wk?.endedAt))
    .sort((a, b) => compareIsoDesc(a?.startedAt, b?.startedAt));

  let streak = 0;
  for (const workout of ordered) {
    const items: StatsItem[] = Array.isArray(workout?.items)
      ? workout.items
      : [];
    const item = items.find((it) => it?.exerciseId === exerciseId);
    if (!item) continue; // вправи не було — ні плюс, ні скидання
    if (item["chosenVariant"] !== "easier") break;
    streak += 1;
  }
  return streak;
}

/**
 * Newest-first ISO-timestamp comparator. Unparseable/missing timestamps
 * sink to the bottom so one malformed entry never hides valid rows.
 * Shared by every "sort by startedAt/at desc" call-site across workouts,
 * measurements, and exercise history.
 */
export function compareIsoDesc(
  aIso: string | null | undefined,
  bIso: string | null | undefined,
): number {
  const at = aIso ? Date.parse(aIso) : NaN;
  const bt = bIso ? Date.parse(bIso) : NaN;
  const aOk = Number.isFinite(at);
  const bOk = Number.isFinite(bt);
  if (!aOk && !bOk) return 0;
  if (!aOk) return 1;
  if (!bOk) return -1;
  return bt - at;
}

export function workoutTonnageKg(w: StatsWorkout | null | undefined): number {
  let t = 0;
  for (const it of w?.items || []) {
    if (it.type === "strength") {
      for (const s of it.sets || []) {
        t += (Number(s.weightKg) || 0) * (Number(s.reps) || 0);
      }
    }
  }
  return t;
}

/**
 * @param nowMs Тестовий шов для незавершеного тренування (`endedAt` ще
 * немає), дефолт `Date.now()`. Канон для двох байт-майже-ідентичних копій
 * (`docs/90-work/audits/unification-modules.md` §2.20).
 */
export function workoutDurationSec(
  w: StatsWorkout | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (!w?.startedAt) return 0;
  const start = Date.parse(w.startedAt);
  const end = w.endedAt ? Date.parse(w.endedAt) : nowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

/** Кількість вправ, де є хоча б один зафіксований «рекорд» за оцінкою Еплі. */
export function personalRecordsExerciseCount(
  workouts: readonly StatsWorkout[] | null | undefined,
): number {
  const by: Record<string, number> = {};
  for (const w of workouts || []) {
    for (const it of w.items || []) {
      const exId = it.exerciseId;
      if (!exId || it.type !== "strength") continue;
      for (const s of it.sets || []) {
        const est = epley1rm(s.weightKg, s.reps);
        if (!est) continue;
        if (!by[exId] || est > by[exId]) by[exId] = est;
      }
    }
  }
  return Object.keys(by).length;
}

/**
 * Індекс дня (0=Пн … 6=Нд) усередині тижня, що починається з `week0`
 * (Пн 00:00 Europe/Kyiv). Рахує перетнуті київські півночі, тому
 * 23/25-годинні DST-дні не зсувають бакет.
 */
function kyivDayIndexInWeek(t: number, week0: number): number {
  return kyivCalendarDaysBetween(t, week0);
}

export interface WeeklyVolumeSeries {
  weekStartMs: number;
  volumeKg: number[];
}

/** 7 значень (Пн…Нд) для поточного календарного тижня (Europe/Kyiv), кг×повторення за день. */
export function weeklyVolumeSeriesNow(
  workouts: readonly StatsWorkout[] | null | undefined,
): WeeklyVolumeSeries {
  const week0 = kyivMondayStartMs(Date.now());
  const vol = [0, 0, 0, 0, 0, 0, 0];

  for (const w of workouts || []) {
    if (!w.endedAt) continue;
    const t = w.startedAt ? Date.parse(w.startedAt) : NaN;
    if (!Number.isFinite(t)) continue;
    const idx = kyivDayIndexInWeek(t, week0);
    if (idx < 0 || idx > 6) continue;
    // Під strict-index `vol[idx]` дає `number | undefined`, хоча
    // інваріант 0..6 гарантує визначеність — narrow-имо явно через
    // `?? 0`, щоб уникнути non-null assertion.
    vol[idx] = (vol[idx] ?? 0) + workoutTonnageKg(w);
  }
  return { weekStartMs: week0, volumeKg: vol };
}

export function formatCompactKg(kg: number | null | undefined): string {
  const n = Number(kg) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function completedWorkoutsCount(
  workouts: readonly StatsWorkout[] | null | undefined,
): number {
  return (workouts || []).filter((w) => w.endedAt).length;
}

export function countCompletedInCurrentWeek(
  workouts: readonly StatsWorkout[] | null | undefined,
): number {
  const week0 = kyivMondayStartMs(Date.now());
  let n = 0;
  for (const w of workouts || []) {
    if (!w.endedAt) continue;
    const t = w.startedAt ? Date.parse(w.startedAt) : NaN;
    if (!Number.isFinite(t)) continue;
    const idx = kyivDayIndexInWeek(t, week0);
    if (idx >= 0 && idx <= 6) n += 1;
  }
  return n;
}

export function totalCompletedVolumeKg(
  workouts: readonly StatsWorkout[] | null | undefined,
): number {
  let s = 0;
  for (const w of workouts || []) {
    if (!w.endedAt) continue;
    s += workoutTonnageKg(w);
  }
  return s;
}
