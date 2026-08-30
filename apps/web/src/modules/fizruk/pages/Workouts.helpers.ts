/**
 * Last validated: 2026-06-05
 * Status: Active
 */
import type { Workout } from "@sergeant/fizruk-domain";
import type {
  ExerciseLocation,
  RawExerciseDef,
} from "@sergeant/fizruk-domain/data";
import { matchesExerciseLocation } from "@sergeant/fizruk-domain/data";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import type { LastExerciseItem } from "./Workouts.types";

/**
 * Render order for primary muscle groups in the catalog browser.
 * Anything not in the list falls to the end alphabetically — see
 * `buildGroupedExercises` below.
 */
export const MUSCLE_GROUP_ORDER: readonly string[] = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "quadriceps",
  "hamstrings",
  "calves",
  "glutes",
  "full_body",
  "cardio",
];

export interface GroupedExercises {
  id: string;
  label: string;
  items: RawExerciseDef[];
  total: number;
}

/**
 * Group an exercise list by `primaryGroup`, preserving the canonical
 * `MUSCLE_GROUP_ORDER`. Each bucket is capped at 80 items in the
 * rendered slice (the `total` count keeps the original size visible).
 */
export function buildGroupedExercises(
  list: readonly RawExerciseDef[],
  equipmentFilter: readonly string[],
  primaryGroupsUk: Record<string, string>,
  locationFilter: ExerciseLocation | "" = "",
): GroupedExercises[] {
  const eqSet = equipmentFilter.length > 0 ? new Set(equipmentFilter) : null;
  const pool = list.filter(
    (ex) =>
      (!eqSet || (ex.equipment ?? []).some((e) => eqSet.has(e))) &&
      matchesExerciseLocation(ex, locationFilter),
  );
  const m = new Map<string, RawExerciseDef[]>();
  for (const ex of pool) {
    const gid = ex.primaryGroup || "full_body";
    const bucket = m.get(gid);
    if (bucket) bucket.push(ex);
    else m.set(gid, [ex]);
  }
  const entries = Array.from(m.entries()).sort((a, b) => {
    const ai = MUSCLE_GROUP_ORDER.indexOf(a[0]);
    const bi = MUSCLE_GROUP_ORDER.indexOf(b[0]);
    return (
      (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) ||
      a[0].localeCompare(b[0])
    );
  });
  return entries.map(([gid, items]) => ({
    id: gid,
    label: primaryGroupsUk[gid] || gid,
    items: items.slice(0, 80),
    total: items.length,
  }));
}

/**
 * Walk all completed (non-active) workouts and pick the most recent
 * occurrence of every exercise. The resulting map is keyed by
 * `exerciseId` and lets the catalog show "last weight × reps" hints.
 */
export function collectLastByExerciseId(
  workouts: readonly Workout[],
  activeWorkoutId: string | null,
): Record<string, LastExerciseItem> {
  const out: Record<string, LastExerciseItem> = {};
  for (const w of workouts || []) {
    if (w.id === activeWorkoutId) continue;
    for (const it of w.items || []) {
      const exId = it.exerciseId;
      if (!exId) continue;
      const existing = out[exId];
      if (
        !existing ||
        (w.startedAt || "").localeCompare(existing._startedAt || "") > 0
      ) {
        out[exId] = { ...it, _startedAt: w.startedAt };
      }
    }
  }
  return out;
}

/**
 * Format active-workout duration as `mm:ss`. Returns `null` when the
 * timestamps are missing/invalid (so the caller can render a blank
 * instead of `NaN:NaN`). `endedAt` is optional — when missing, `now`
 * (a live tick from `Date.now()`) is used so the UI keeps updating.
 */
export function formatActiveDuration(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  now: number,
): string | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return null;
  const sec = Math.floor((end - start) / 1000);
  const totalMin = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, "0");
  if (totalMin >= 60) {
    const hh = Math.floor(totalMin / 60);
    const mm = String(totalMin % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  const mm = String(totalMin).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Default retro-workout date — today's calendar date in `YYYY-MM-DD`,
 * anchored to **Europe/Kyiv** (domain invariant) rather than the device
 * clock, so late-evening users on a non-Kyiv host don't get the wrong day
 * (page-audit-06 F11). Name kept for call-site stability.
 */
export function todayLocalDateString(): string {
  // AI-DANGER: day boundary is Europe/Kyiv, not the device clock or UTC.
  // Must stay routed through `getKyivDayKey()`. Swapping to
  // `new Date().toISOString().slice(0,10)` or `toLocaleDateString` silently
  // shifts the date for late-evening / non-Kyiv hosts and breaks streaks.
  return getKyivDayKey();
}

/** Результат розбору форми «Внести проведене заняття». */
export interface PastWorkoutTimes {
  /** ISO-мітка початку. */
  startedAt: string;
  /** ISO-мітка завершення — завжди пізніша за `startedAt`. */
  endedAt: string;
  /**
   * `true`, коли кінець переповз на наступну добу (сесія через північ).
   * Форма показує це підписом: додавати добу мовчки не можна — людина
   * має бачити, що «23:40 → 00:20» вона щойно записала як 40 хвилин, а
   * не як мінус 23 години.
   */
  crossesMidnight: boolean;
  /**
   * `true`, коли перенос через північ дав неправдоподібно довгу сесію.
   *
   * «18:00 → 16:00» формально означає добу мінус дві години, тобто 22-годинне
   * тренування — насправді це майже завжди описка в одному з полів. Мовчки
   * приймати такий перенос двічі погано: у журнал лягає сесія на 22 години, а
   * на СЬОГОДНІШНІЙ даті кінець ще й переїжджає в завтра, тож людина отримує
   * «завершення ще не настало» — повідомлення про наслідок, а не про причину.
   */
  implausiblyLong: boolean;
  /**
   * `true`, коли кінець ще не настав. Завершене тренування в майбутньому —
   * не «проведене»: воно потрапило б у стрік і статистику за день, якого ще
   * не було. `max` на полі дати цього НЕ ловить: він обмежує лише добу, тож
   * «сьогодні 23:00», введене о десятій ранку, проходить. Найтихіший випадок —
   * сесія через північ на сьогоднішній даті: перенос на завтра робить кінець
   * майбутнім завжди.
   */
  inFuture: boolean;
}

/**
 * Стеля тривалості для сесії, ЯКУ довелось перенести через північ. Свідомо
 * щедра: нічний похід чи довгий заїзд у 8-10 годин мають проходити. Усе, що
 * довше, — не тренування через північ, а описка в одному з полів, і форма
 * має сказати саме це.
 */
const MAX_ROLLOVER_SESSION_MS = 12 * 60 * 60 * 1000;

/** `YYYY-MM-DD` + `HH:MM` → локальний `datetime-local`-рядок. */
function joinLocal(dateKey: string, time: string): string {
  return `${dateKey}T${time}`;
}

/**
 * Збирає пару ISO-міток із того, що людина ввела у формі.
 *
 * Час читається як **настінний годинник пристрою** — так само, як у
 * `WorkoutTimeEditor` (`datetime-local` → `datetimeLocalValueToIso`).
 * Це навмисно: обидва контроли правлять ту саму сутність, і якби ретро-форма
 * рахувала київський час, а редактор — пристроєвий, та сама сесія показувала б
 * різні години залежно від того, звідки її відкрили. Київ лишається лише для
 * ДЕФОЛТНОЇ дати (`todayLocalDateString`), бо це межа доби, а не мить.
 *
 * `null` — коли ввід неповний або нерозбірний; форма тоді просто не пускає далі.
 */
export function buildPastWorkoutTimes(
  dateKey: string,
  startTime: string,
  endTime: string,
  // eslint-disable-next-line no-restricted-syntax -- порівнюємо мить із миттю (кінець проти «зараз»), а не межі доби; київський календар тут ні до чого. Параметр існує, щоб тест міг запнути годинник.
  now: Date = new Date(),
): PastWorkoutTimes | null {
  if (!dateKey || !startTime || !endTime) return null;

  const startMs = Date.parse(joinLocal(dateKey, startTime));
  let endMs = Date.parse(joinLocal(dateKey, endTime));
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;

  const crossesMidnight = endMs <= startMs;
  if (crossesMidnight) {
    const next = new Date(startMs);
    /* eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078:
       додається доба до МОМЕНТУ, який людина щойно ввела своїм годинником,
       а не до межі київської доби. Поля-конструктори `Date` самі коректно
       перекочують через DST; київський календар тут дав би зсув для
       не-київського хоста рівно там, де його не має бути. */
    next.setDate(next.getDate() + 1);
    const [hh, mm] = endTime.split(":").map(Number);
    next.setHours(hh ?? 0, mm ?? 0, 0, 0);
    endMs = next.getTime();
  }

  return {
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(endMs).toISOString(),
    crossesMidnight,
    implausiblyLong:
      crossesMidnight && endMs - startMs > MAX_ROLLOVER_SESSION_MS,
    inFuture: endMs > now.getTime(),
  };
}
