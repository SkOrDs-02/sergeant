/**
 * Канонічний періодний агрегатор Фізрука: скільки тренувань і який обʼєм
 * (кг × повторення) припадає на діапазон.
 *
 * AI-CONTEXT: до цього файлу та сама математика жила у трьох копіях —
 * `apps/web/src/core/insights/useWeeklyDigest.ts` (`aggregateFizruk`),
 * `apps/mobile/src/core/dashboard/weeklyDigestAggregates.ts` і
 * Hub-Reports (`aggregateWorkouts`, який рахує лише кількість). Копії
 * розходяться в дрібницях (джерело даних, парсинг дат), а пишуть в один і
 * той самий `POST /api/weekly-digest`.
 *
 * W1-CANON-AGG стадія 1 — additive: жоден call-site тут не перемикається,
 * функція поки без споживачів за задумом. Реєстр розбіжностей і план
 * переведення: `docs/02-engineering/architecture/metric-registry.md`.
 *
 * DOM-free: приймає вже прочитаний масив тренувань (SQLite warm-cache на web,
 * MMKV на mobile) і межі періоду в мілісекундах; межі доби/тижня рахує
 * викликач (Europe/Kyiv за доменним інваріантом).
 */

interface AggSet {
  weightKg?: number | null | undefined;
  reps?: number | null | undefined;
  [key: string]: unknown;
}

interface AggItem {
  nameUk?: string | null | undefined;
  type?: string | null | undefined;
  sets?: AggSet[] | null | undefined;
  [key: string]: unknown;
}

interface AggWorkout {
  startedAt?: string | null | undefined;
  endedAt?: string | null | undefined;
  items?: AggItem[] | null | undefined;
  [key: string]: unknown;
}

export interface FizrukPeriodAggregate {
  /** Кількість завершених тренувань у періоді. */
  workoutsCount: number;
  /** Сумарний обʼєм (кг × повторення), округлений. */
  totalVolumeKg: number;
  /** Обʼєм у розрізі вправ (ключ — `exerciseKey`), значення округлені. */
  byExercise: Record<string, number>;
}

export interface FizrukPeriodAggregateOptions {
  /** Нижня межа діапазону (мс), включно. */
  start: number;
  /** Верхня межа діапазону (мс), виключно. За замовчуванням +∞. */
  end?: number;
  /**
   * Чи вимагати завершене тренування (`endedAt`). Дефолт `true` — саме так
   * рахують дайджест (web+mobile) і Hub-Reports: незавершена сесія не
   * потрапляє у статистику періоду.
   */
  requireEnded?: boolean;
  /**
   * Чи рахувати обʼєм лише для силових вправ. Дефолт `false` — це поточна
   * семантика дайджесту (сумує сети всіх типів). `workoutTonnageKg`
   * (`workoutStats.ts`) навпаки бере лише `type === "strength"`; розбіжність
   * зафіксована в реєстрі метрик і вирішується окремо.
   */
  strengthOnly?: boolean;
  /**
   * Бакет для вправи. Дефолт — `item.nameUk` (як у дайджесті); вправи без
   * ключа в розріз не потрапляють, але їхній обʼєм входить у `totalVolumeKg`.
   */
  exerciseKey?: (item: AggItem) => string | null | undefined;
}

function setVolume(sets: AggSet[] | null | undefined): number {
  let vol = 0;
  for (const s of sets ?? []) {
    const w = Number(s?.weightKg) || 0;
    const r = Number(s?.reps) || 0;
    vol += w * r;
  }
  return vol;
}

export function calcFizrukPeriodAggregate(
  workouts: readonly AggWorkout[] | null | undefined,
  options: FizrukPeriodAggregateOptions,
): FizrukPeriodAggregate {
  const {
    start,
    end = Number.POSITIVE_INFINITY,
    requireEnded = true,
    strengthOnly = false,
    exerciseKey = (item) => item.nameUk,
  } = options;

  const list = Array.isArray(workouts) ? workouts : [];
  let workoutsCount = 0;
  let totalVolume = 0;
  const byExercise: Record<string, number> = {};

  for (const w of list) {
    if (!w) continue;
    if (requireEnded && !w.endedAt) continue;
    const ms = w.startedAt ? Date.parse(w.startedAt) : Number.NaN;
    if (!Number.isFinite(ms) || ms < start || ms >= end) continue;
    workoutsCount += 1;

    for (const item of w.items ?? []) {
      if (!item) continue;
      if (strengthOnly && item.type !== "strength") continue;
      const vol = setVolume(item.sets);
      if (!Number.isFinite(vol) || vol === 0) continue;
      totalVolume += vol;
      const key = exerciseKey(item);
      if (key) byExercise[key] = (byExercise[key] ?? 0) + vol;
    }
  }

  const byExerciseRounded: Record<string, number> = {};
  for (const k of Object.keys(byExercise)) {
    byExerciseRounded[k] = Math.round(byExercise[k] ?? 0);
  }

  return {
    workoutsCount,
    totalVolumeKg: Math.round(totalVolume),
    byExercise: byExerciseRounded,
  };
}
