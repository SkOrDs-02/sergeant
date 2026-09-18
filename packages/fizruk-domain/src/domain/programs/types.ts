/**
 * Shared domain types for the Fizruk **Programs** screen.
 *
 * Platform-neutral — consumed by `apps/web` (port in a follow-up) and
 * `apps/mobile`. The shapes describe the built-in training-program
 * catalogue plus the small persisted slice
 * (`ActiveProgramState`) that tracks the user's currently-active
 * program id.
 *
 * Weekday convention mirrors the web page: day numbers in the schedule
 * are 1-based (`1 = Monday … 7 = Sunday`) so the JSON payload lines up
 * with how humans write a split. The "today" resolver converts
 * JavaScript's Sunday-first `Date#getDay()` to this Monday-first
 * 0-indexed space via `(d.getDay() + 6) % 7` and then matches
 * `schedule.day - 1 === weekdayIndex`.
 */

/** 1 = Mon … 7 = Sun — matches the web catalogue exactly. */
export type ProgramScheduleDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Canonical monday-first 0-indexed weekday (`0 = Mon … 6 = Sun`). */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A single planned session slot inside a program's weekly schedule. */
export interface ProgramScheduleEntry {
  /** Day of week — 1 = Mon … 7 = Sun. */
  readonly day: ProgramScheduleDay;
  /** Session key into {@link TrainingProgramDef.sessions}. */
  readonly sessionKey: string;
  /** Localised human-readable title (e.g. "Push — Груди, плечі, трицепс"). */
  readonly name: string;
}

/** Definition of a single program session (one day of the split). */
export interface ProgramSessionDef {
  readonly name: string;
  readonly exerciseIds: readonly string[];
  /** Weight increment (kg) to add per session for compound lifts. */
  readonly progressionKg: number;
  /** Default rest between sets, in seconds. */
  readonly defaultRestSec: number;
}

/**
 * Full definition of a built-in training program.
 *
 * `durationWeeks` is the nominal plan length (e.g. "8 тижнів"); the
 * catalogue is evergreen — a program can be re-started indefinitely —
 * but we surface the length so the card can show a weekly cadence
 * ("6 дн/тиждень · 8 тижнів").
 */
export interface TrainingProgramDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Training days per week (length of `schedule`). */
  readonly days: number;
  /** Nominal plan length, in weeks. */
  readonly durationWeeks: number;
  readonly schedule: readonly ProgramScheduleEntry[];
  readonly sessions: Readonly<Record<string, ProgramSessionDef>>;
}

/**
 * Persisted slice tracking which program is currently active. Callers
 * load this from MMKV / localStorage via
 * {@link import("./state.js").normalizeActiveProgramState} and write
 * it back on activate / deactivate.
 */
export interface ActiveProgramState {
  readonly activeProgramId: string | null;
}

/**
 * Resolved "today's planned session" — when an active program exists
 * *and* its schedule has an entry for today's weekday.
 */
export interface TodayProgramSession {
  readonly programId: string;
  readonly schedule: ProgramScheduleEntry;
  readonly session: ProgramSessionDef;
}
