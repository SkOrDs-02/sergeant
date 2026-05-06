/**
 * `useActiveFizrukWorkout` — mobile hook for the Fizruk active-workout
 * session (Phase 6 · PR-B).
 *
 * Mirrors the inline state the web page `apps/web/src/modules/fizruk/
 * pages/Workouts.tsx` manages today: the id of the currently-active
 * workout, live elapsed seconds since its `startedAt`, and the rest
 * timer between sets. The hook is intentionally split into two
 * independent pieces so each is unit-testable in isolation:
 *
 *   - `useElapsedSeconds(startedAt)` — monotonic 1 Hz tick that derives
 *     elapsed seconds from `Date.parse(startedAt)` instead of a local
 *     counter. This is drift-resistant: if the JS loop stalls (eg. the
 *     app is backgrounded for a minute) the first tick after resume
 *     still reports the correct elapsed time.
 *   - `useRestTimer()` — countdown with the same drift-resistant
 *     pattern (`endAt = Date.now() + total * 1000`, each tick derives
 *     `remaining` from the wall clock, no decrement). Also surfaces
 *     `justFinishedNaturally` (true for one tick after the remaining
 *     hits 0, false on explicit `cancel()`), mirroring the web page's
 *     `restCompletedNaturally` ref → haptics / sound trigger.
 *
 * On top of those, `useActiveFizrukWorkout()` reads/writes the active
 * workout id into MMKV under the shared `FIZRUK_ACTIVE_WORKOUT` storage
 * key (`packages/shared/src/lib/storageKeys.ts`, so CloudSync picks the
 * same slot), and engages `expo-keep-awake` while a workout is active
 * so the screen stays on during a training session — per
 * `docs/mobile/react-native-migration.md` §6.10.
 *
 * Scope note (Phase 6 · PR-B): this hook owns **only** activeWorkoutId
 * + timers. Workout CRUD (sets / items / groups) still lives in the
 * web inline state and lands together with the full `Workouts` page
 * port in PR-F.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { STORAGE_KEYS } from "@sergeant/shared";

import { safeReadStringLS, safeRemoveLS, safeWriteLS } from "@/lib/storage";

const FIZRUK_ACTIVE_WORKOUT = STORAGE_KEYS.FIZRUK_ACTIVE_WORKOUT;

/**
 * Internal seam for tests — the real implementation uses
 * `expo-keep-awake` (native side-effect), which a jest unit test can
 * stub without touching the native module.
 */
export interface KeepAwakeAdapter {
  activate(tag: string): void;
  deactivate(tag: string): void;
}

function defaultKeepAwakeAdapter(): KeepAwakeAdapter {
  // Lazy-require so jest mocks can fully replace the dependency and we
  // don't explode at module-load time when running in a pure Node test
  // environment.
  return {
    activate(tag: string) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const KeepAwake = require("expo-keep-awake") as {
          activateKeepAwakeAsync?: (tag: string) => Promise<void>;
        };
        void KeepAwake.activateKeepAwakeAsync?.(tag);
      } catch {
        // expo-keep-awake not installed / jest env — safe no-op.
      }
    },
    deactivate(tag: string) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const KeepAwake = require("expo-keep-awake") as {
          deactivateKeepAwake?: (tag: string) => void;
        };
        KeepAwake.deactivateKeepAwake?.(tag);
      } catch {
        // no-op (see above)
      }
    },
  };
}

const FIZRUK_KEEP_AWAKE_TAG = "sergeant.fizruk.active-workout";

export interface RestTimerState {
  /** Total duration of the current rest in seconds. */
  total: number;
  /** Remaining seconds. Always `0 <= remaining <= total`. */
  remaining: number;
}

export interface UseRestTimerResult {
  restTimer: RestTimerState | null;
  /** Start a new rest countdown. Overwrites any in-flight timer. */
  startRestTimer(totalSec: number): void;
  /** User-initiated cancellation (does NOT flip `justFinishedNaturally`). */
  cancelRestTimer(): void;
  /**
   * `true` for exactly one render after the countdown hits 0. The
   * consumer resets it via `clearJustFinished()` once it has reacted
   * (haptics / sound). This avoids a ref-in-parent dance.
   */
  justFinishedNaturally: boolean;
  clearJustFinished(): void;
}

/**
 * Pure seconds-since-startedAt tick. Derives the value from the wall
 * clock on every interval fire, so background pauses don't cause
 * drift. Returns `null` when `startedAt` is falsy or unparseable.
 */
export function useElapsedSeconds(
  startedAt: string | null | undefined,
  /** Override for unit tests. */
  now: () => number = Date.now,
): number | null {
  const [value, setValue] = useState<number | null>(() => {
    if (!startedAt) return null;
    const start = Date.parse(startedAt);
    if (!Number.isFinite(start)) return null;
    return Math.max(0, Math.floor((now() - start) / 1000));
  });

  useEffect(() => {
    if (!startedAt) {
      setValue(null);
      return undefined;
    }
    const start = Date.parse(startedAt);
    if (!Number.isFinite(start)) {
      setValue(null);
      return undefined;
    }
    setValue(Math.max(0, Math.floor((now() - start) / 1000)));
    const id = setInterval(() => {
      setValue(Math.max(0, Math.floor((now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt, now]);

  return value;
}

/**
 * Rest-timer state machine. Tracks the **end timestamp** internally
 * and re-derives `remaining` on each tick, matching the web page's
 * intent while avoiding setInterval-decrement drift.
 */
export function useRestTimer(now: () => number = Date.now): UseRestTimerResult {
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);
  const [justFinishedNaturally, setJustFinishedNaturally] = useState(false);
  const endAtRef = useRef<number | null>(null);

  const startRestTimer = useCallback(
    (totalSec: number) => {
      const safeTotal = Math.max(0, Math.floor(totalSec));
      endAtRef.current = now() + safeTotal * 1000;
      setRestTimer({ total: safeTotal, remaining: safeTotal });
      setJustFinishedNaturally(false);
    },
    [now],
  );

  const cancelRestTimer = useCallback(() => {
    endAtRef.current = null;
    setRestTimer(null);
    setJustFinishedNaturally(false);
  }, []);

  const clearJustFinished = useCallback(() => {
    setJustFinishedNaturally(false);
  }, []);

  useEffect(() => {
    if (!restTimer || endAtRef.current === null) return undefined;
    const id = setInterval(() => {
      const end = endAtRef.current;
      if (end === null) return;
      const remaining = Math.max(0, Math.ceil((end - now()) / 1000));
      if (remaining <= 0) {
        endAtRef.current = null;
        setRestTimer(null);
        setJustFinishedNaturally(true);
        return;
      }
      setRestTimer((prev) =>
        prev && prev.remaining === remaining
          ? prev
          : prev
            ? { ...prev, remaining }
            : prev,
      );
    }, 1000);
    return () => clearInterval(id);
  }, [restTimer, now]);

  return {
    restTimer,
    startRestTimer,
    cancelRestTimer,
    justFinishedNaturally,
    clearJustFinished,
  };
}

export interface UseActiveFizrukWorkoutResult {
  activeWorkoutId: string | null;
  setActiveWorkoutId(id: string | null): void;
  clearActiveWorkout(): void;
  /**
   * Live elapsed seconds since the provided `startedAt`. `null` when
   * no active workout / no `startedAt` yet.
   */
  elapsedSec: number | null;
  restTimer: RestTimerState | null;
  startRestTimer(totalSec: number): void;
  cancelRestTimer(): void;
  justFinishedRestNaturally: boolean;
  clearJustFinished(): void;
}

export interface UseActiveFizrukWorkoutOptions {
  /**
   * ISO string of the active workout's `startedAt`. Must be passed in
   * from the workout CRUD layer (which still lives in web inline state
   * at the time of this PR); when present, drives `elapsedSec`.
   */
  startedAt?: string | null;
  /** Override for unit tests. */
  now?: () => number;
  /** Override for unit tests. */
  keepAwake?: KeepAwakeAdapter;
}

export function useActiveFizrukWorkout(
  options: UseActiveFizrukWorkoutOptions = {},
): UseActiveFizrukWorkoutResult {
  const { startedAt = null, now = Date.now } = options;
  const keepAwakeRef = useRef<KeepAwakeAdapter>(
    options.keepAwake ?? defaultKeepAwakeAdapter(),
  );

  const [activeWorkoutId, setActiveWorkoutIdState] = useState<string | null>(
    () => safeReadStringLS(FIZRUK_ACTIVE_WORKOUT, null),
  );

  const setActiveWorkoutId = useCallback((id: string | null) => {
    setActiveWorkoutIdState(id);
    if (id === null || id === "") {
      safeRemoveLS(FIZRUK_ACTIVE_WORKOUT);
    } else {
      safeWriteLS(FIZRUK_ACTIVE_WORKOUT, id);
    }
  }, []);

  const clearActiveWorkout = useCallback(() => {
    setActiveWorkoutId(null);
  }, [setActiveWorkoutId]);

  // Keep the device awake while a workout is active. The tag is stable
  // so repeat-activations don't stack reference counts in unexpected
  // ways — expo-keep-awake uses tag-based ref counting internally.
  useEffect(() => {
    const adapter = keepAwakeRef.current;
    if (activeWorkoutId) {
      adapter.activate(FIZRUK_KEEP_AWAKE_TAG);
      return () => adapter.deactivate(FIZRUK_KEEP_AWAKE_TAG);
    }
    return undefined;
  }, [activeWorkoutId]);

  const elapsedSec = useElapsedSeconds(activeWorkoutId ? startedAt : null, now);
  const rest = useRestTimer(now);

  return {
    activeWorkoutId,
    setActiveWorkoutId,
    clearActiveWorkout,
    elapsedSec,
    restTimer: rest.restTimer,
    startRestTimer: rest.startRestTimer,
    cancelRestTimer: rest.cancelRestTimer,
    justFinishedRestNaturally: rest.justFinishedNaturally,
    clearJustFinished: rest.clearJustFinished,
  };
}
