/**
 * Last validated: 2026-09-15
 * Status: Active
 *
 * Швидкий запис — «+20 відтискань» як справжній `Workout`.
 *
 * AI-CONTEXT (рішення власника 2026-09-15). До цього дня легка активність
 * жила окремим островом: лічильник відтискань у `fizruk_pushups`, картка на
 * Прогресі з трьома числами — і жодного звʼязку зі стріком, відновленням,
 * калоріями чи історією. Модуль при цьому вже мав другий короткий вхід у
 * журнал — «Заняття за часом» (`LogPastWorkoutSheet`), який пише звичайний
 * `Workout` і працює з усіма системами без винятків. Лічильник дублював
 * гіршою формою те, що модуль уміє. Тому швидкий запис — це не окрема
 * сутність, а той самий `Workout` з одним силовим item-ом і одним підходом
 * без ваги; далі він живе, як усі: у журналі, у відновленні, у калоріях, і
 * стрік читає його вагу через `classifyWorkoutWeight` (канон §8) — один
 * підхід за пів хвилини лишається «легким» і серію не рухає.
 *
 * Історію самого лічильника в журнал переносили не тут, а SQL-міграціями
 * обох сховищ (серверна 140 і клієнтська `007_fizruk_pushups_to_workouts`):
 * той самий будівник відтворено в SQL, id детермінований
 * (`pushups:<user>:<день>`), тож обидві сторони зійшлися на одному рядку.
 */
import {
  FizrukData,
  type Workout,
  type WorkoutItem,
} from "@sergeant/fizruk-domain";

/**
 * Вправи, доступні чіпами у швидкому записі. Усі — з власною вагою і на
 * повторення: саме такі речі людина робить «між справами» і хоче записати
 * одним числом. Вправи на час (планка) сюди не входять навмисно — для них
 * є «Заняття за часом».
 */
export const QUICK_LOG_EXERCISE_IDS = [
  "pushup",
  "squat_bodyweight",
  "pullup",
  "crunch",
  "glute_bridge",
  "burpee",
] as const;

export type QuickLogExerciseId = (typeof QUICK_LOG_EXERCISE_IDS)[number];

/** Короткі підписи чіпів: каталожна назва («Віджимання від підлоги») задовга для ряду. */
export const QUICK_LOG_EXERCISE_LABELS_UK: Record<QuickLogExerciseId, string> =
  {
    pushup: "Відтискання",
    squat_bodyweight: "Присідання",
    pullup: "Підтягування",
    crunch: "Скручування",
    glute_bridge: "Місток",
    burpee: "Бурпі",
  };

/** Пресети повторень під чіпами — ті самі, що мав лічильник, плюс 50. */
export const QUICK_LOG_REPS_PRESETS = [10, 20, 30, 50] as const;

/** Стеля повторень за один запис — захист від зайвого нуля, як `MAX_PORTION_GRAMS` у їжі. */
export const QUICK_LOG_MAX_REPS = 1000;

/**
 * Оцінка тривалості запису, коли годинник ніхто не вів: ~2 с на повторення,
 * не менше півхвилини й не більше десяти хвилин. Це не вимір, а щоб запис
 * мав ненульову тривалість для відновлення й калорій — і щоб 20 повторень
 * ніколи не перетнули поріг «повноцінного» за часом (20 хв).
 */
export function estimateQuickLogDurationSec(reps: number): number {
  const n = Math.max(0, Math.floor(Number(reps) || 0));
  return Math.min(600, Math.max(30, n * 2));
}

export interface BuildQuickLogWorkoutInput {
  exerciseId: string;
  reps: number;
  /** Мить завершення (ISO). Початок виводиться назад через оцінку тривалості. */
  endedAt: string;
  /** Власний id — для детермінованої міграції; за замовчуванням генерується. */
  id?: string | undefined;
  /** Оцінка витрат, коли вона є (вага відома). */
  kcalBurned?: number | null | undefined;
  note?: string | undefined;
}

/**
 * Зібрати завершений `Workout` для швидкого запису.
 *
 * `null`, якщо вправи немає в каталозі або повторень нуль — викликач тоді
 * нічого не пише, а не пише порожнє тренування.
 */
export function buildQuickLogWorkout(
  input: BuildQuickLogWorkoutInput,
): Workout | null {
  const reps = Math.floor(Number(input.reps) || 0);
  if (reps <= 0 || reps > QUICK_LOG_MAX_REPS) return null;
  const ex = FizrukData.findExerciseById(input.exerciseId);
  if (!ex) return null;
  const endedMs = Date.parse(input.endedAt);
  if (!Number.isFinite(endedMs)) return null;

  const durationSec = estimateQuickLogDurationSec(reps);
  const id = input.id ?? `w_${crypto.randomUUID()}`;
  const item: WorkoutItem = {
    id: `${id}_i1`,
    exerciseId: ex.id,
    nameUk: ex.name.uk,
    primaryGroup: ex.primaryGroup,
    musclesPrimary: ex.muscles?.primary ?? [],
    musclesSecondary: ex.muscles?.secondary ?? [],
    type: "strength",
    sets: [{ weightKg: 0, reps }],
    ...(typeof ex.met === "number" ? { met: ex.met } : {}),
  };

  return {
    id,
    startedAt: new Date(endedMs - durationSec * 1000).toISOString(),
    endedAt: new Date(endedMs).toISOString(),
    items: [item],
    groups: [],
    warmup: null,
    cooldown: null,
    note: input.note ?? "",
    ...(typeof input.kcalBurned === "number" && input.kcalBurned > 0
      ? { kcalBurned: input.kcalBurned }
      : {}),
  };
}
