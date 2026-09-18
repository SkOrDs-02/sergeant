/**
 * Pure "today's session" resolver for the Fizruk Programs screen.
 *
 * All three helpers here accept a `now` seam so unit tests can freeze
 * the clock without stubbing `Date` globally.
 */

import type {
  ProgramScheduleEntry,
  ProgramSessionDef,
  TodayProgramSession,
  TrainingProgramDef,
  WeekdayIndex,
} from "./types.js";

/**
 * Monday-first 0-indexed weekday (`0 = Mon … 6 = Sun`). Accepts a
 * `now` seam for testing.
 */
export function weekdayIndex(now: Date = new Date()): WeekdayIndex {
  return ((now.getDay() + 6) % 7) as WeekdayIndex;
}

/**
 * Schedule entry for a given `(program, weekdayIndex)` pair, or
 * `null` when the program has no session on that day.
 *
 * `dayIndex` follows the canonical {@link WeekdayIndex} convention
 * (`0 = Mon … 6 = Sun`) — convert JS `Date#getDay()` via
 * {@link weekdayIndex} first.
 */
export function getProgramScheduleForDay(
  program: TrainingProgramDef | null | undefined,
  dayIndex: number,
): ProgramScheduleEntry | null {
  if (!program) return null;
  if (!Number.isFinite(dayIndex) || dayIndex < 0 || dayIndex > 6) return null;
  const found = program.schedule.find((s) => s.day - 1 === dayIndex);
  return found ?? null;
}

/**
 * Session definition for a given `(program, weekdayIndex)`, or `null`
 * when there is no session today or the session key is missing from
 * {@link TrainingProgramDef.sessions}.
 */
export function getProgramSessionForDay(
  program: TrainingProgramDef | null | undefined,
  dayIndex: number,
): ProgramSessionDef | null {
  const schedule = getProgramScheduleForDay(program, dayIndex);
  if (!schedule || !program) return null;
  return program.sessions[schedule.sessionKey] ?? null;
}

/**
 * Resolve the "today's session" triple for an active program. Returns
 * `null` when no program is active, when today is a rest day, or when
 * the scheduled session key is missing from the program definition.
 */
export function resolveTodaySession(
  program: TrainingProgramDef | null | undefined,
  now: Date = new Date(),
): TodayProgramSession | null {
  if (!program) return null;
  const idx = weekdayIndex(now);
  const schedule = getProgramScheduleForDay(program, idx);
  if (!schedule) return null;
  const session = program.sessions[schedule.sessionKey];
  if (!session) return null;
  return { programId: program.id, schedule, session };
}
