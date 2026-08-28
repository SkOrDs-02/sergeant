/**
 * Last validated: 2026-08-07
 * Status: Active
 *
 * Матриця «мʼяз × тиждень» — signature-view Фізрука (П4,
 * `docs/05-design/design/anti-slop-strategy.md`).
 *
 * AI-CONTEXT: діагноз тут той самий, що в Рутині (`flexStreak.ts`) і Фініку
 * (`recurringDetect.ts`) — інформація вже порахована, а екран її згортав.
 * `Progress.tsx` будував чотиритижневу матрицю повністю, і в тому ж
 * виразі, де вона зʼявлялась, брав `keys[0]` — лише останній тиждень. Три
 * тижні з чотирьох викидались за рядок від власного обчислення. Тобто
 * «груди тримаються, ноги провалюються третій тиждень поспіль» уже лежало
 * в памʼяті й не показувалось ніколи.
 *
 * Форма — стовпчики на осі часу, та сама граматика, що в гребені Фініка.
 * Це навмисно: продукт із власною мовою має кілька форм, ужитих
 * послідовно, а нова форма на кожен модуль — це той самий слоп, лише
 * дорожчий.
 */
import { kyivMondayStartMs } from "@sergeant/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Скільки тижнів у вікні. Чотири — стільки ж, скільки міряв старий код. */
export const MATRIX_WEEKS = 4;

/**
 * Поріг мовчання. З одним тижнем даних матриця не показує ТРЕНДУ — вона
 * показує один стовпчик і три порожні місця, тобто гірша за просту смугу.
 * Той самий клас рішення, що `MIN_ENTRIES = 4` у гребені Фініка й `MIN_N`
 * у крос-модульних звʼязках: вид зʼявляється, коли йому є що сказати.
 */
export const MIN_WEEKS_WITH_DATA = 2;

/** Скільки груп показуємо. Стільки ж, скільки показував старий список. */
export const MATRIX_ROWS = 10;

/**
 * Структурний вхід замість імпорту типів воркаутів — щоб функція лишалась
 * тестованою без усього стека хуків.
 *
 * `| undefined` виписане явно: у репо ввімкнено `exactOptionalPropertyTypes`,
 * тож `field?: T | null` означає «або відсутнє, або T, або null», але НЕ
 * «undefined», і реальні типи воркаутів у такий контракт не лягають.
 */
interface MatrixSet {
  weightKg?: number | string | null | undefined;
  reps?: number | string | null | undefined;
}

interface MatrixItem {
  type?: string | null | undefined;
  musclesPrimary?: string[] | null | undefined;
  musclesSecondary?: string[] | null | undefined;
  sets?: MatrixSet[] | null | undefined;
  durationSec?: number | string | null | undefined;
  distanceM?: number | string | null | undefined;
}

interface MatrixWorkout {
  startedAt?: string | null | undefined;
  items?: MatrixItem[] | null | undefined;
}

export interface MuscleWeekRow {
  id: string;
  label: string;
  /** Бали по тижнях, найстаріший → найновіший. Довжина завжди `MATRIX_WEEKS`. */
  weekly: number[];
  /** Останній тиждень — число, яке лишається на екрані числом. */
  latest: number;
  /** Сума за вікно. Саме за нею ранжуються рядки. */
  total: number;
}

export interface MuscleWeekMatrix {
  /** Київські понеділки вікна, за зростанням. Довжина завжди `MATRIX_WEEKS`. */
  weekStarts: number[];
  rows: MuscleWeekRow[];
  /**
   * Спільний максимум по ВСІЙ матриці, а не по рядку.
   *
   * AI-DANGER: нормалізувати кожен рядок окремо тут не можна. Рядок,
   * нормалізований сам на себе, завжди має один повний стовпчик — і група,
   * якою людина займалась раз на місяць, виглядала б рівно так само, як та,
   * яку вона тягне щотижня. Тобто зникло б саме те порівняння, заради якого
   * матриця й існує.
   */
  max: number;
  /** Скільки тижнів вікна мають бодай один запис. */
  weeksWithData: number;
}

/** Бали одного елемента тренування — та сама формула, що була в `Progress.tsx`. */
function itemPoints(item: MatrixItem): number {
  if (item.type === "strength") {
    return (
      (item.sets || []).reduce(
        (sum, s) => sum + (Number(s.weightKg) || 0) * (Number(s.reps) || 0),
        0,
      ) / 1000
    );
  }
  if (item.type === "time") return (Number(item.durationSec) || 0) / 240;
  if (item.type === "distance") {
    return (
      (Number(item.distanceM) || 0) / 1000 +
      (Number(item.durationSec) || 0) / 60 / 30
    );
  }
  return 0;
}

/**
 * Будує матрицю за `MATRIX_WEEKS` київських тижнів назад від `nowMs`.
 *
 * Межа вікна тепер вирівняна по тижнях, а не «мінус 28 днів»: колонка
 * підписана тижнем, і напівтиждень у крайній колонці читався б як провал,
 * якого не було.
 *
 * Тиждень БЕЗ тренувань лишається в матриці як справжній нуль, а не як
 * пропуск. Це не дрібниця: рівно на цій різниці вже спіткнулись
 * крос-модульні звʼязки (`ABSENCE_MEANS` у `dailySeries.ts`), де відкидання
 * порожніх днів перетворювало питання на таке, де відповідь гарантована.
 * Не потренувався ≠ «не виміряно»; тут порожній тиждень і є відповідь.
 */
export function buildMuscleWeekMatrix(
  workouts: MatrixWorkout[] | null | undefined,
  musclesUk: Record<string, string> | null | undefined,
  nowMs: number,
): MuscleWeekMatrix {
  // Кожен понеділок рахуємо від власної дати, а не відніманням 7 днів від
  // попереднього: у тиждень із переводом годинника доба не рівна 24 годинам,
  // і ланцюжок віднімань поїхав би.
  const weekStarts: number[] = [];
  for (let i = MATRIX_WEEKS - 1; i >= 0; i -= 1) {
    weekStarts.push(kyivMondayStartMs(nowMs - i * 7 * DAY_MS));
  }
  const weekIndex = new Map(weekStarts.map((ms, idx) => [ms, idx]));
  const cutoff = weekStarts[0] ?? nowMs;

  const byMuscle = new Map<string, number[]>();
  const weeksSeen = new Set<number>();

  for (const w of workouts || []) {
    const started = w.startedAt ? Date.parse(w.startedAt) : NaN;
    if (!Number.isFinite(started) || started < cutoff) continue;
    const idx = weekIndex.get(kyivMondayStartMs(started));
    if (idx === undefined) continue;

    for (const item of w.items || []) {
      const pts = itemPoints(item);
      if (pts === 0) continue;
      weeksSeen.add(idx);
      const add = (id: string, weight: number) => {
        if (!id) return;
        let row = byMuscle.get(id);
        if (!row) {
          row = new Array<number>(MATRIX_WEEKS).fill(0);
          byMuscle.set(id, row);
        }
        row[idx] = (row[idx] ?? 0) + pts * weight;
      };
      for (const id of item.musclesPrimary || []) add(id, 1);
      for (const id of item.musclesSecondary || []) add(id, 0.55);
    }
  }

  const rows: MuscleWeekRow[] = [...byMuscle.entries()]
    .map(([id, weekly]) => ({
      id,
      label: musclesUk?.[id] || id,
      weekly,
      latest: weekly[MATRIX_WEEKS - 1] ?? 0,
      total: weekly.reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, MATRIX_ROWS);

  const max = rows.reduce((best, r) => Math.max(best, ...r.weekly), 0);

  return { weekStarts, rows, max: max || 1, weeksWithData: weeksSeen.size };
}
