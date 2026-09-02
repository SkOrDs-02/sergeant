/**
 * Shared muscle-recovery computation logic used by `useRecovery` and recovery forecasts.
 */

import { kyivCalendarDaysBetween } from "@sergeant/shared";
import type {
  MuscleState,
  RecoveryStatus,
  Workout,
  DailyLogEntry,
  WorkoutItem,
} from "../domain/types";

export type { MuscleState, RecoveryStatus };

/** Clamp `n` to the inclusive range `[a, b]`. */
function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

/**
 * Calculate the effective training load points for a single exercise item.
 * Strength: tonnage (kg × reps) / 1000 + set count × 0.15
 * Time-based: durationSec / 240
 * Distance/cardio: km + minutes / 30
 * @param {{ type: string, sets?: Array<{weightKg: number, reps: number}>, durationSec?: number, distanceM?: number }} item
 * @returns {number} Load points ≥ 0.
 */
export function loadPointsForItem(
  item: Partial<WorkoutItem> | null | undefined,
): number {
  if (!item) return 0;
  if (item.type === "strength") {
    const sets = item.sets || [];
    const tonnage = sets.reduce(
      (s, x) => s + (Number(x.weightKg) || 0) * (Number(x.reps) || 0),
      0,
    );
    const setCount = sets.filter(
      (x) => (Number(x.reps) || 0) > 0 || (Number(x.weightKg) || 0) > 0,
    ).length;
    return tonnage / 1000 + setCount * 0.15;
  }
  if (item.type === "time") {
    const sec = Number(item.durationSec) || 0;
    return sec / 240;
  }
  if (item.type === "distance") {
    const km = (Number(item.distanceM) || 0) / 1000;
    const min = (Number(item.durationSec) || 0) / 60;
    return km + min / 30;
  }
  return 0;
}

/**
 * Скільки годин запис самопочуття лишається придатним як вхід recovery.
 *
 * ⚠️ **Інженерний дефолт, не рішення founder-а.** Аудит E-3 називає діапазон
 * «≤48–72 год», канон числа не дає. 72 години обрано як верхню межу того
 * діапазону: сон дволітньої давності про сьогоднішню готовність не каже
 * нічого, але вужче вікно вимикало б множник у того, хто веде журнал не
 * щодня, і фіча ставала б безглуздою.
 *
 * AI-DANGER: без цього вікна єдиний запис «8.5 год сну» місячної давності
 * НАЗАВЖДИ прискорював видиме відновлення (множник до 0.7) — тобто зсував
 * кольори в бік «тренуй раніше» саме там, де на них тримається травма-safety
 * (§5 канону). Це і був розрив E-3.
 */
export const WELLBEING_FRESH_WINDOW_HOURS = 72;

const MS_PER_HOUR = 60 * 60 * 1000;

/** Розібраний вхід самопочуття — множник плюс те, ЧОМУ він такий. */
export interface WellbeingSignal {
  /** Множник для формули втоми, clamp [0.7, 1.4]. */
  multiplier: number;
  /** Вік найсвіжішого запису зі сном у годинах. `null` — записів немає. */
  sleepAgeHours: number | null;
  /** Вік найсвіжішого запису з енергією. `null` — записів немає. */
  energyAgeHours: number | null;
  /** Сон реально врахований (запис існує і потрапив у вікно). */
  usedSleep: boolean;
  /** Енергія реально врахована. */
  usedEnergy: boolean;
  /**
   * Записи є, але жоден не потрапив у вікно — множник відкотився до 1.0.
   * UI має це показувати: інакше «журнал заповнено» і «журнал впливає» —
   * різні речі, які виглядають однаково.
   */
  stale: boolean;
  /** Вікно, за яким рахували. */
  windowHours: number;
}

function ageHours(at: string | undefined, nowMs: number): number | null {
  if (typeof at !== "string" || at.length === 0) return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  // Майбутня дата — це 0 годин тому, не відʼємний вік.
  return Math.max(0, (nowMs - t) / MS_PER_HOUR);
}

/**
 * Compute a recovery multiplier from recent daily log entries.
 * Prioritises the most recent entry with sleep data and most recent entry with
 * energy data independently (they may be logged on different days).
 * Poor sleep (<6h) or low energy (≤2/5) slows recovery by 20–30%
 * (multiplier > 1 increases effective fatigue time).
 * Good sleep/energy speeds recovery (multiplier < 1).
 * Falls back to 1.0 when no sleep/energy data is present **or when the
 * freshest entry is older than {@link WELLBEING_FRESH_WINDOW_HOURS}**.
 */
export function computeWellbeingSignal(
  dailyLogEntries: Array<Partial<DailyLogEntry>> = [],
  nowMs: number = Date.now(),
  windowHours: number = WELLBEING_FRESH_WINDOW_HOURS,
): WellbeingSignal {
  const empty: WellbeingSignal = {
    multiplier: 1.0,
    sleepAgeHours: null,
    energyAgeHours: null,
    usedSleep: false,
    usedEnergy: false,
    stale: false,
    windowHours,
  };
  if (!dailyLogEntries || dailyLogEntries.length === 0) return empty;

  const sorted = [...dailyLogEntries].sort((a, b) =>
    (b.at || "").localeCompare(a.at || ""),
  );

  // Find the most recent entry that has sleep data
  const latestSleepEntry = sorted.find(
    (e) => e.sleepHours != null && Number.isFinite(Number(e.sleepHours)),
  );
  // Find the most recent entry that has energy data
  const latestEnergyEntry = sorted.find(
    (e) => e.energyLevel != null && Number.isFinite(Number(e.energyLevel)),
  );

  const sleepAgeHours = ageHours(latestSleepEntry?.at, nowMs);
  const energyAgeHours = ageHours(latestEnergyEntry?.at, nowMs);
  // Запис без придатної дати не має віку — і не має права рухати множник:
  // «невідомо коли» ближче до «давно», ніж до «щойно».
  const usedSleep = sleepAgeHours !== null && sleepAgeHours <= windowHours;
  const usedEnergy = energyAgeHours !== null && energyAgeHours <= windowHours;

  let multiplier = 1.0;

  if (usedSleep && latestSleepEntry) {
    const hrs = Number(latestSleepEntry.sleepHours);
    if (hrs < 5) multiplier += 0.3;
    else if (hrs < 6) multiplier += 0.2;
    else if (hrs < 7) multiplier += 0.1;
    else if (hrs >= 8) multiplier -= 0.1;
  }

  if (usedEnergy && latestEnergyEntry) {
    const energy = Number(latestEnergyEntry.energyLevel);
    if (energy <= 1) multiplier += 0.3;
    else if (energy <= 2) multiplier += 0.2;
    else if (energy <= 2.5) multiplier += 0.15;
    else if (energy >= 4.5) multiplier -= 0.15;
    else if (energy >= 4) multiplier -= 0.1;
  }

  const hasAnyEntry = Boolean(latestSleepEntry || latestEnergyEntry);
  return {
    multiplier: clamp(multiplier, 0.7, 1.4),
    sleepAgeHours,
    energyAgeHours,
    usedSleep,
    usedEnergy,
    stale: hasAnyEntry && !usedSleep && !usedEnergy,
    windowHours,
  };
}

/** Лише множник — тонка обгортка над {@link computeWellbeingSignal}. */
export function computeWellbeingMultiplier(
  dailyLogEntries: Array<Partial<DailyLogEntry>> = [],
  nowMs: number = Date.now(),
): number {
  return computeWellbeingSignal(dailyLogEntries, nowMs).multiplier;
}

/**
 * Build a map of muscle-group id → recovery state.
 * Equivalent to the `by` object returned by `useRecovery`.
 * @param {Array<{items?: Array, startedAt?: number}>} workouts - completed workout records
 * @param {Record<string, string>} musclesUk - muscle id → Ukrainian display label
 * @param {number} [nowMs] - current timestamp in ms (default: Date.now())
 * @param {Array<{at?: string, sleepHours?: number, energyLevel?: number}>} [dailyLogEntries]
 * @returns {Record<string, MuscleState>}
 */
export function computeRecoveryBy(
  workouts: Array<Partial<Workout>> = [],
  musclesUk: Record<string, string> = {},
  nowMs: number = Date.now(),
  dailyLogEntries: Array<Partial<DailyLogEntry>> = [],
): Record<string, MuscleState> {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const DAY = 24 * 60 * 60 * 1000;
  const FORTNIGHT = 14 * DAY;

  // `nowMs` передаємо далі навмисно: без нього вікно свіжості рахувалось би
  // від справжнього годинника, а решта функції — від переданого часу, і
  // тести з фіксованим `now` міряли б дві різні «зараз».
  const wellbeingMult = computeWellbeingMultiplier(dailyLogEntries, nowMs);

  const muscleIds = new Set(Object.keys(musclesUk || {}));
  for (const w of workouts || []) {
    for (const it of w.items || []) {
      for (const m of it.musclesPrimary || []) muscleIds.add(m);
      for (const m of it.musclesSecondary || []) muscleIds.add(m);
    }
  }

  const by: Record<string, MuscleState> = {};
  for (const id of muscleIds) {
    by[id] = {
      id,
      label: musclesUk?.[id] || id,
      lastAt: null,
      daysSince: null,
      load7d: 0,
      load14d: 0,
      fatigue: 0,
      status: "green",
    };
  }

  for (const w of workouts || []) {
    const t = w.startedAt ? Date.parse(w.startedAt) : NaN;
    if (!Number.isFinite(t)) continue;
    const in7d = nowMs - t <= WEEK;
    const in14d = nowMs - t <= FORTNIGHT;
    for (const it of w.items || []) {
      const ptsBase = loadPointsForItem(it);
      const ageDays = Math.max(0, (nowMs - t) / DAY);
      const decay = Math.exp(-ageDays / 2.2);

      const apply = (m: string | undefined, wgt: number) => {
        if (!m) return;
        if (!by[m]) {
          by[m] = {
            id: m,
            label: musclesUk?.[m] || m,
            lastAt: null,
            daysSince: null,
            load7d: 0,
            load14d: 0,
            fatigue: 0,
            status: "green",
          };
        }
        const row = by[m];
        row.lastAt = row.lastAt == null ? t : Math.max(row.lastAt, t);
        if (in7d) row.load7d += ptsBase * wgt;
        if (in14d) row.load14d = (row.load14d ?? 0) + ptsBase * wgt;
        row.fatigue += ptsBase * wgt * decay * wellbeingMult;
      };

      for (const m of it.musclesPrimary || []) apply(m, 1);
      for (const m of it.musclesSecondary || []) apply(m, 0.55);
    }
  }

  for (const m of Object.values(by)) {
    if (m.lastAt != null) {
      // Kyiv calendar days, not elapsed 24h windows: a workout yesterday
      // at 23:00 is "1 день тому" this morning (domain invariant).
      m.daysSince = clamp(kyivCalendarDaysBetween(nowMs, m.lastAt), 0, 999);
    }
    const ds = m.daysSince ?? Infinity;
    if (m.lastAt == null) m.status = "green";
    else if (ds <= 1) m.status = "red";
    else if (m.fatigue >= 4.5) m.status = "red";
    else if (m.fatigue >= 2.2 || ds <= 3) m.status = "yellow";
    else m.status = "green";
  }

  return by;
}

/** «Повне» відновлення: зелений статус (fatigue < 2.2, daysSince > 3 у логіці вище). */
export function isFullyRecovered(
  row: Pick<MuscleState, "status" | "lastAt"> | null | undefined,
): boolean {
  return row?.status === "green" && row?.lastAt != null;
}
