/**
 * Back-compat shim for the legacy `lib/trainingPrograms` surface.
 *
 * The canonical source for the training-program catalogue + resolvers
 * lives in {@link import("../domain/programs/index.js")}. This file
 * preserves the loose-typed helper that `apps/web` has depended on
 * since the pre-Phase-6 era:
 *
 *  - `getTodaySession(program)` — returns the **schedule entry**
 *    (`{ day, sessionKey, name }`) for today or `null` on a rest
 *    day. New mobile / web code should prefer
 *    {@link import("../domain/programs/today.js").resolveTodaySession}
 *    which returns the fully-resolved `{ programId, schedule, session }`
 *    triple.
 *
 * `BUILTIN_PROGRAMS` and `getProgramScheduleForDay` are re-exported
 * directly from `domain/programs` via the top-level package barrel —
 * consumers should import them from `@sergeant/fizruk-domain` without
 * reaching for `/lib/`.
 */

import {
  getProgramScheduleForDay,
  weekdayIndex,
  type ProgramScheduleEntry,
  type TrainingProgramDef,
} from "../domain/programs/index.js";

/**
 * Schedule entry for today (based on the current system clock) or
 * `null` on a rest day. Maintains the legacy signature — callers that
 * need the fully-resolved `{ programId, schedule, session }` triple
 * should use `resolveTodaySession` from `domain/programs`.
 */
export function getTodaySession(
  program: TrainingProgramDef | null | undefined,
): ProgramScheduleEntry | null {
  return getProgramScheduleForDay(program, weekdayIndex());
}
