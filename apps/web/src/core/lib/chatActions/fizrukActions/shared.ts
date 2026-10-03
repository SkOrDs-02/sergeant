import { safeReadLS } from "@shared/lib/storage/storage";
import { triggerFizrukDualWrite } from "../../../../modules/fizruk/lib/sqliteWriter/index";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractCustomExerciseSnapshots,
  extractDailyLogSnapshots,
  extractWorkoutSnapshots,
  peekFizrukDualWriteState,
  type FizrukDailyLogEntryLike,
} from "../../../../modules/fizruk/lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../../../../modules/fizruk/lib/sqliteReader";
import type {
  FizrukData,
  Workout as DomainWorkout,
} from "@sergeant/fizruk-domain";
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

/**
 * Read the canonical workout list from the SQLite warm-cache.
 * `fizruk_workouts_v1` is tombstoned (#057f-tombstone) — `useWorkouts` reads
 * this cache, so chat-action mutators must too (the LS key is drained on boot
 * and read by nobody).
 */
export function readFizrukWorkouts(): DomainWorkout[] {
  const cache = getCachedFizrukSqliteState();
  return cache.refreshedAt === null ? [] : cache.workouts;
}

/**
 * Persist the workout list through the dual-write pipeline — mirror of
 * `useWorkouts.persist`. Fire-and-forget; a no-op pre-auth.
 */
export function persistFizrukWorkouts(workouts: DomainWorkout[]): void {
  const prevDualWrite =
    peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
  try {
    triggerFizrukDualWrite(prevDualWrite, {
      ...prevDualWrite,
      workouts: extractWorkoutSnapshots(workouts),
    });
  } catch {
    /* trigger is fire-and-forget — never propagate */
  }
}

/**
 * Записати нові користувацькі вправи тим самим шляхом, що й UI
 * (`useExerciseCatalog.addExercise` → `triggerFizrukDualWrite` зі зрізом
 * `customExercises`). Мусить іти ДО `persistFizrukWorkouts` у тому ж
 * екзекуторі: черга dual-write послідовна, тож вправа стає в outbox раніше за
 * item, що на неї посилається (data-11). Нові вправи йдуть першими, дублі за
 * id замінюються — як у `addExercise`. Fire-and-forget; a no-op pre-auth.
 */
export function persistFizrukCustomExercises(
  exercises: readonly FizrukData.RawExerciseDef[],
): void {
  if (exercises.length === 0) return;
  const prevDualWrite =
    peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
  const addedIds = new Set(exercises.map((ex) => ex.id));
  try {
    triggerFizrukDualWrite(prevDualWrite, {
      ...prevDualWrite,
      customExercises: [
        ...extractCustomExerciseSnapshots(
          exercises.map((ex) => ({ ...ex, _custom: true })),
        ),
        ...prevDualWrite.customExercises.filter((ex) => !addedIds.has(ex.id)),
      ],
    });
  } catch {
    /* trigger is fire-and-forget — never propagate */
  }
}

/**
 * Read the canonical daily-log list from the SQLite warm-cache — the same
 * source `useDailyLog` renders from.
 *
 * AI-DANGER: до 2026-09-16 читалось із LS-ключа `fizruk_daily_log_v1`, який
 * UI не читає з DCRUD-007 (журнал живе в `fizruk_daily_log`, ключ у вебі
 * ніхто не пише). Chat-екшени будували `next = [entry, ...LS]` — тобто без
 * жодного реального запису — і віддавали це в dual-write проти `prev` з
 * кешу: diff емітив `daily-log-delete` на КОЖЕН запис журналу, який кеш
 * знав. Один «запиши сон 8 годин» у чаті стирав увесь журнал тіла
 * (`wellbeing.cacheJournal.test.ts`). Тому джерело для читання тут — той
 * самий кеш, що й для `prev`, і тільки він.
 */
export function readFizrukDailyLog(): FizrukDailyLogEntryLike[] {
  const cache = getCachedFizrukSqliteState();
  return cache.refreshedAt === null ? [] : cache.dailyLog;
}

/**
 * Persist the daily-log list through the dual-write pipeline — mirror of
 * `useDailyLog.persist`, minus the intent ref: chat-екшени пишуть один раз
 * і не ланцюжать «видалити → повернути» одного id, тож prev із кешу тут
 * достатній (diff чіпає лише id, що є в prev або next). Fire-and-forget;
 * a no-op pre-auth.
 */
export function persistFizrukDailyLog(
  entries: FizrukDailyLogEntryLike[],
): void {
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

/**
 * Undo для щойно записаного chat-екшеном запису журналу. Кеш у момент undo
 * ще може не знати про запис (refresh іде після apply), тому prev будується
 * як «кеш + цей запис», а не як сирий кеш — інакше diff бачив би два
 * однакові списки й undo мовчки не робив нічого.
 */
export function deleteFizrukDailyLogEntry(
  entry: FizrukDailyLogEntryLike & { id: string },
): void {
  const cached = peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
  const current = readFizrukDailyLog();
  const withEntry = current.some((e) => e.id === entry.id)
    ? current
    : [entry, ...current];
  try {
    triggerFizrukDualWrite(
      { ...cached, dailyLog: extractDailyLogSnapshots(withEntry) },
      {
        ...cached,
        dailyLog: extractDailyLogSnapshots(
          current.filter((e) => e.id !== entry.id),
        ),
      },
    );
  } catch {
    /* trigger is fire-and-forget — never propagate */
  }
}
