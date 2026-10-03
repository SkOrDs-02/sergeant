/**
 * Shared domain types for the Fizruk module.
 *
 * Intentionally loose (optional fields, open unions) so gradual TS adoption
 * does not break existing JS callers or persisted localStorage payloads.
 */

/** Recovery status for a muscle group. */
export type RecoveryStatus = "green" | "yellow" | "red";

/** Recovery state for a single muscle group. */
export interface MuscleState {
  id: string;
  label: string;
  lastAt: number | null;
  daysSince: number | null;
  load7d: number;
  /**
   * Training-load points within the last 14 days (same accrual rule as
   * `load7d`, wider window). Optional/additive: `computeRecoveryBy` always
   * sets it, but hand-built `MuscleState` fixtures elsewhere (tests, the
   * synthesized injury/avoid rows in `useRecovery`) predate the field and
   * stay valid without it. Feeds the hero "loaded in the last 14 days"
   * gate (`selectHeroRecoveryRows`) — nothing in the recovery model itself
   * reads it.
   */
  load14d?: number;
  fatigue: number;
  status: RecoveryStatus;
  /** Active user-marked pain/injury hard-blocks this muscle from advice. */
  injured?: boolean;
}

/** Checklist item (warm-up / cool-down step). */
export interface ChecklistItem {
  id: string;
  done: boolean;
  label: string;
}

/** A single exercise set (weight × reps). */
export interface WorkoutSet {
  weightKg: number;
  reps: number;
  // Persisted payloads carry extra ad-hoc fields (e.g. `_at` annotations
  // attached when computing PR/last-top sets). Mirrors the loose shape of
  // `WorkoutItem`/`Workout` so consumers can structurally narrow without
  // running into `Index signature for type 'string' is missing` errors
  // when matching the local `StatsSet` interface in `lib/workoutStats`.
  [key: string]: unknown;
}

/** Kind of exercise entry. */
export type WorkoutItemType = "strength" | "distance" | "time";

/** Вибір людини між плановим варіантом підказки і другою кнопкою. */
export type WorkoutVariantChoice = "planned" | "easier" | "harder";

/** A single exercise entry within a workout session. */
export interface WorkoutItem {
  id: string;
  exerciseId: string;
  nameUk: string;
  primaryGroup: string;
  musclesPrimary: string[];
  musclesSecondary: string[];
  type: WorkoutItemType;
  sets?: WorkoutSet[] | undefined;
  durationSec?: number | undefined;
  distanceM?: number | undefined;
  /**
   * Який варіант підказки людина обрала на цій вправі.
   *
   * Відсутнє поле означає `"planned"` — так тренування, зроблені до появи
   * готовності, читаються без міграції й не потрапляють у лічильник
   * полегшень. Живе саме тут, а не в `Workout.wellbeing`, бо лічильник
   * «три полегшення поспіль» рахується ПО ВПРАВІ, і однієї відповіді на все
   * заняття для нього замало.
   */
  chosenVariant?: WorkoutVariantChoice | undefined;
  /**
   * MET (metabolic equivalent) вправи чи заняття — вхід формули витрат
   * (`computeKcalBurned`). Необовʼязкове: записи, зроблені до появи поля,
   * просто не дають оцінки.
   */
  met?: number | undefined;
  /** Рівень зусилля; множить і MET, і тривалість для розрахунку втоми. */
  intensity?: "easy" | "normal" | "hard" | undefined;
  [key: string]: unknown;
}

/** Superset group inside a workout. */
export interface WorkoutGroup {
  id: string;
  itemIds: string[];
  /**
   * Group flavour — superset (parallel) or circuit (sequential). Optional
   * because legacy persisted groups may omit it; the UI defaults to
   * "superset" rendering when absent.
   */
  type?: "circuit" | "superset" | undefined;
  /**
   * Shared rest duration (seconds) between rounds of the group. Optional
   * because legacy persisted groups may omit it; the UI falls back to 60s.
   */
  restSec?: number | undefined;
}

/**
 * Optional self-reported wellbeing snapshot attached to a workout.
 *
 * `energy` / `mood` пише аркуш ФІНІШУ тренування; `sleep` / `soreness` —
 * аркуш ГОТОВНОСТІ на старті. Різні моменти, одна сутність, бо обидва
 * описують стан людини саме на це заняття.
 *
 * AI-DANGER: індексна сигнатура НЕ означає, що нове поле збережеться.
 * Дуал-райт іде через `toWellbeingSnapshot` у
 * `apps/web/src/modules/fizruk/lib/fizrukDualWriteState.ts`, і той віддає
 * білий список полів. Додав поле сюди — проведи його ще через снапшот,
 * колонку `wellbeing_json`, `sqliteReader` і тест на перезавантаження,
 * інакше воно гине мовчки: типи й тести лишаються зеленими, зникає лише
 * продукт (той самий сценарій, що описаний в `AI-DANGER` у `sqliteReader`).
 */
export interface WorkoutWellbeing {
  energy?: number | null;
  mood?: number | null;
  /** Сон, 1-5, де 1 = погано. Шкала збігається за напрямком із `soreness`. */
  sleep?: number | null;
  /** «Як почуваються мʼязи», 1-5, де 1 = дуже болить. */
  soreness?: number | null;
  [key: string]: unknown;
}

/** A complete workout session. */
export interface Workout {
  id: string;
  startedAt: string;
  endedAt: string | null;
  items: WorkoutItem[];
  groups: WorkoutGroup[];
  warmup: ChecklistItem[] | null;
  cooldown: ChecklistItem[] | null;
  note: string;
  wellbeing?: WorkoutWellbeing | null;
  /**
   * Оцінка витрачених калорій, збережена ЧИСЛОМ на момент запису. Не
   * перераховується заднім числом при зміні ваги — див. `kcalBurned.ts`.
   */
  kcalBurned?: number | undefined;
  [key: string]: unknown;
}

/** Persisted daily log entry (sleep, energy, weight, mood…). */
export interface DailyLogEntry {
  id: string;
  at: string;
  weightKg?: number | null;
  sleepHours?: number | null;
  energyLevel?: number | null;
  mood?: number | null;
  note?: string;
  [key: string]: unknown;
}

/** Body progress photo record. */
export interface BodyPhoto {
  id: string;
  date: string;
  dataUrl: string;
  note: string;
  createdAt: number | string;
}

/** Measurement entry (chest/waist/etc. in cm, weight in kg…). */
export interface MeasurementEntry {
  id: string;
  at: string;
  [fieldId: string]: string | number | undefined;
}

/** User-saved workout template. */
export interface WorkoutTemplate {
  id: string;
  name: string;
  exerciseIds: string[];
  groups: WorkoutGroup[];
  updatedAt: string;
  lastUsedAt?: string;
}

/** Built-in training program session day. */
export interface ProgramSession {
  id: string;
  name: string;
  exerciseIds: string[];
  progressionKg?: Record<string, number>;
  [key: string]: unknown;
}

/** Built-in training program. */
export interface TrainingProgram {
  id: string;
  name: string;
  description?: string;
  sessions: ProgramSession[];
  weekPattern?: (string | null)[];
  [key: string]: unknown;
}

/** Exercise definition from the exercise catalog. */
export interface ExerciseDef {
  id: string;
  nameUk: string;
  primaryGroup: string;
  musclesPrimary: string[];
  musclesSecondary: string[];
  type: WorkoutItemType;
  [key: string]: unknown;
}
