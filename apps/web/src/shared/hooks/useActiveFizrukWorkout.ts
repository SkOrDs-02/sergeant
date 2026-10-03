import { useEffect, useMemo, useState } from "react";
import { ACTIVE_WORKOUT_KEY } from "@sergeant/fizruk-domain";
import { safeReadStringLS, safeRemoveLS } from "@shared/lib/storage/storage";
import { useFizrukSqliteReadTick } from "@fizruk/lib/sqliteReadGate";
import { getCachedFizrukSqliteState } from "@fizruk/lib/sqliteReader";

/**
 * Shared read-only pointer to the in-progress Fizruk workout.
 *
 * Fizruk persists `fizruk_active_workout_id_v1` in localStorage while a
 * workout is open. Other surfaces (Hub header, module pages, cross-module
 * CTAs) need to see that signal so they can offer a "Повернутися до
 * тренування" shortcut without pulling in the whole `useWorkouts` API.
 *
 * The active-id key is the single source of truth for "is there a session
 * to resume?", but it can end up stale in several real-world paths:
 *   - cloud-sync pulls in the completed session from another device but
 *     this device's active-id key was never cleared,
 *   - the workouts list gets wiped (FIZRUK_RESET_KEYS, manual reset, demo
 *     data cleanup) while the active-id key was missed,
 *   - a workout was ended through a non-UI path (hub chat `finish_workout`
 *     failing mid-write, cross-tab race) without clearing the active-id,
 *   - the referenced workout was deleted.
 * In all of those the banner would keep blinking "Тренування триває" even
 * though there is nothing to return to — this hook therefore validates the
 * pointer against the canonical Fizruk SQLite warm-cache and treats it as
 * `null` (and clears the stale key) if the workout is missing or already has
 * `endedAt`. Before the warm-cache has loaded the hook fails open and keeps
 * the pointer; clearing it while `refreshedAt === null` would recreate the
 * Stage 8 tombstone bug where `fizruk_workouts_v1` no longer exists.
 *
 * Listens to `storage` events so that when the user ends a workout in
 * another tab the banner disappears immediately, not on next navigation.
 *
 * Same-tab workout writes are observed through the existing Fizruk SQLite
 * read tick; cross-tab pointer changes still arrive through `storage`.
 */
interface ActiveIdReading {
  id: string | null;
  /** Pointer survives in storage but no longer names a live workout. */
  stale: boolean;
}

/** Pure: reads external stores, never writes. Safe to call during render. */
function readActiveId(): ActiveIdReading {
  const id = safeReadStringLS(ACTIVE_WORKOUT_KEY);
  if (!id) return { id: null, stale: false };

  const cache = getCachedFizrukSqliteState();
  if (cache.refreshedAt === null) return { id, stale: false };

  const match = cache.workouts.find((workout) => workout.id === id);
  if (!match || match.endedAt) return { id: null, stale: true };
  return { id, stale: false };
}

function clearStaleActiveId(): void {
  safeRemoveLS(ACTIVE_WORKOUT_KEY);
}

export function useActiveFizrukWorkout(): string | null {
  const sqliteTick = useFizrukSqliteReadTick();
  // Cross-tab pointer writes fire `storage`, which no render can observe on
  // its own; bumping an epoch turns that into a dependency the read below
  // can key off, without assigning derived state inside an effect.
  const [storageEpoch, setStorageEpoch] = useState(0);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // e.key === null means storage was cleared entirely (logout, sync).
      if (e.key === ACTIVE_WORKOUT_KEY || e.key === null) {
        setStorageEpoch((epoch) => epoch + 1);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const { id, stale } = useMemo(
    () => readActiveId(),
    // Both entries are version tokens for the external stores the read
    // touches — the SQLite warm cache and the localStorage pointer. The read
    // takes no arguments, so the rule cannot see that they are the whole
    // point of re-running it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ефект перезапускається саме на «тік» після запису, який правило не бачить
    [sqliteTick, storageEpoch],
  );

  // Dropping the dead pointer is a write, so it stays out of render.
  useEffect(() => {
    if (stale) clearStaleActiveId();
  }, [stale]);

  return id;
}
