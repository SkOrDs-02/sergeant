import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { triggerFizrukDualWrite } from "../../../../modules/fizruk/lib/dualWrite/index";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractDailyLogSnapshots,
  peekFizrukDualWriteState,
  type FizrukDailyLogEntryLike,
} from "../../../../modules/fizruk/lib/fizrukDualWriteState";
import type { Workout } from "../types";

const WORKOUTS_KEY = "fizruk_workouts_v1";

export function readWorkouts(): Workout[] {
  const parsed = safeReadLS<unknown>(WORKOUTS_KEY, null);
  if (Array.isArray(parsed)) return parsed as Workout[];
  if (
    parsed &&
    typeof parsed === "object" &&
    "workouts" in parsed &&
    Array.isArray((parsed as { workouts: unknown }).workouts)
  ) {
    return (parsed as { workouts: Workout[] }).workouts;
  }
  return [];
}

const DAILY_LOG_KEY = "fizruk_daily_log_v1";

export function readFizrukDailyLog(): FizrukDailyLogEntryLike[] {
  const parsed = safeReadLS<FizrukDailyLogEntryLike[]>(DAILY_LOG_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Persist the daily-log list exactly like `useDailyLog.persist` does: write
 * LS (still the read-source for the Fizruk daily-log UI) AND mirror to SQLite
 * through the dual-write pipeline, so cross-device sync and SQLite-backed
 * readers stay current. The trigger is fire-and-forget and a no-op pre-auth.
 */
export function persistFizrukDailyLog(
  entries: FizrukDailyLogEntryLike[],
): void {
  safeWriteLS(DAILY_LOG_KEY, entries);
  const prevDualWrite =
    peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
  try {
    triggerFizrukDualWrite(prevDualWrite, {
      ...prevDualWrite,
      dailyLog: extractDailyLogSnapshots(entries),
    });
  } catch {
    /* trigger is fire-and-forget — never propagate */
  }
}
