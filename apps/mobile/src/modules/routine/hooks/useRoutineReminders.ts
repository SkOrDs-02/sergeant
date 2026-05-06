/**
 * Sergeant Routine — `useRoutineReminders` hook (React Native).
 *
 * Mobile port of
 * `apps/web/src/modules/routine/hooks/useRoutineReminders.ts`, but
 * retargeted at `expo-notifications` weekly triggers so the scheduler
 * survives the app being backgrounded / killed — the web SW shim that
 * hand-rolls `setTimeout` doesn't make sense on native.
 *
 * Scope of this cut (Phase 5 / PR 6 — Reminders):
 *
 *  - Iterates `RoutineState.habits` and schedules one repeating weekly
 *    notification per habit × routine weekday × reminder "HH:MM".
 *    Skips archived habits and habits without any `reminderTimes`.
 *  - Maps routine's 0=Mon..6=Sun convention to Expo's 1=Sun..7=Sat via
 *    `routineWeekdayToExpoWeekday` / `computeTriggerForHabitWeekday`
 *    from `@sergeant/routine-domain/domain/reminders`. Pure helpers
 *    are unit-tested separately on the package side.
 *  - Persists `habitId -> scheduledNotificationId[]` into MMKV under
 *    `routine/reminders/scheduled` (`SCHEDULED_MAP_KEY`) so we can
 *    cancel previously-scheduled notifications before re-scheduling
 *    (or on habit delete / archive). MMKV-backed so reschedule across
 *    cold starts does not leak duplicate notifications.
 *  - Debounces re-scheduling on habit-list changes (250ms).
 *  - Lazy permission model: the hook does NOT prompt the system on
 *    mount. It reads the current status via `getPermissionsAsync`.
 *    Callers (e.g. a "Дозволити" button in settings, or HabitForm's
 *    "reminder on" toggle) invoke `requestPermission()` to actually
 *    open the native prompt.
 *  - Gracefully no-ops if `expo-notifications` is not available (Jest
 *    / SSR), or if permission is `denied` / `undetermined`.
 *
 * Exposed API:
 *   {
 *     permission: 'granted' | 'denied' | 'undetermined',
 *     requestPermission(): Promise<void>,
 *     reschedule(): Promise<void>,
 *     cancelAll(): Promise<void>,
 *   }
 *
 * Intentional differences from the web hook:
 *  - No per-minute polling / idempotency localStorage keys. Expo's
 *    weekly trigger handles the "fire once per week at this time"
 *    contract for us.
 *  - No completion-aware filtering. An Expo trigger cannot be
 *    conditionally cancelled based on "has the user already tapped the
 *    habit today" — that would require the notification action handler
 *    to poll live state. For Phase 5 we accept an occasional already-
 *    completed ping; a future iteration can layer
 *    `Notifications.dismissNotificationAsync` via an
 *    `addNotificationReceivedListener` hook.
 *  - `monthly` / `once` recurrences are skipped. Expo's weekly cron
 *    trigger cannot encode them; the pure adapter
 *    `habitActiveRoutineWeekdays` returns `[]` for those and we emit
 *    zero reminders.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";

import {
  computeTriggerForHabitWeekday,
  habitActiveRoutineWeekdays,
  normalizeReminderTimes,
  parseReminderTime,
  type Habit,
  type RoutineState,
} from "@sergeant/routine-domain";

import { safeReadLS, safeWriteLS } from "@/lib/storage";

/** MMKV slot holding `habitId -> scheduledNotificationId[]` (JSON). */
export const SCHEDULED_MAP_KEY = "routine/reminders/scheduled";

/** Debounce window for re-scheduling on habit-list changes. */
const RESCHEDULE_DEBOUNCE_MS = 250;

export type RoutineReminderPermission = "granted" | "denied" | "undetermined";

export interface UseRoutineRemindersApi {
  /** Current notification permission state (tri-state — no `unsupported`). */
  permission: RoutineReminderPermission;
  /**
   * Ask the OS for notification permission (iOS / Android 13+).
   * No-op if permission is already `granted`. After the call
   * completes, `permission` is refreshed and — if granted — reminders
   * are immediately re-scheduled.
   */
  requestPermission: () => Promise<void>;
  /** Cancel + re-schedule all reminders from the current state. */
  reschedule: () => Promise<void>;
  /** Cancel every reminder we own and clear the MMKV map. */
  cancelAll: () => Promise<void>;
}

/** Shape persisted under `SCHEDULED_MAP_KEY`. */
type ScheduledMap = Record<string, string[]>;

/**
 * Read the habit→notification-id map from MMKV. Defensive — any
 * malformed persisted value degrades to an empty map rather than
 * throwing out of the hook.
 */
function readScheduledMap(): ScheduledMap {
  const raw = safeReadLS<unknown>(SCHEDULED_MAP_KEY, null);
  if (!raw || typeof raw !== "object") return {};
  const out: ScheduledMap = {};
  for (const [habitId, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!Array.isArray(value)) continue;
    const ids = value.filter((v): v is string => typeof v === "string");
    if (ids.length > 0) out[habitId] = ids;
  }
  return out;
}

function writeScheduledMap(next: ScheduledMap): void {
  safeWriteLS(SCHEDULED_MAP_KEY, next);
}

/**
 * Map an `expo-notifications` permission response to our tri-state.
 * iOS `provisional` authorisation counts as `granted` — matches
 * `registerPush.ensurePermissions` and `NotificationsSection`.
 */
function toPermission(
  perm: Notifications.NotificationPermissionsStatus | null | undefined,
): RoutineReminderPermission {
  if (!perm) return "undetermined";
  if (perm.granted) return "granted";
  const iosProv =
    perm.ios?.status === Notifications.IosAuthorizationStatus?.PROVISIONAL;
  if (iosProv) return "granted";
  if (perm.status === "denied") return "denied";
  return "undetermined";
}

/**
 * Is the `expo-notifications` module actually wired up? Jest mocks
 * the full surface, but a bare-metal RN test or SSR path might import
 * the package without the native methods attached — the hook must not
 * crash in that case (per the Phase 5 requirements).
 */
function hasNotificationsModule(): boolean {
  return (
    typeof Notifications !== "undefined" &&
    typeof Notifications.getPermissionsAsync === "function"
  );
}

/**
 * Cancel a list of scheduled notification ids, swallowing per-id
 * failures (Expo throws if the id no longer exists, e.g. after the
 * user cleared system notifications).
 */
async function cancelIds(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      /* noop — already gone or platform error */
    }
  }
}

/**
 * Schedule every reminder described by a habit, returning the list of
 * newly-created notification ids. Skips silently when there is no
 * scheduling work to do for the habit (archived, no times, no active
 * weekdays) — the caller uses an empty array as a signal that the
 * habit should be removed from the MMKV map.
 */
async function scheduleHabit(h: Habit): Promise<string[]> {
  const times = normalizeReminderTimes(h);
  if (times.length === 0) return [];
  const routineWeekdays = habitActiveRoutineWeekdays(h);
  if (routineWeekdays.length === 0) return [];

  const out: string[] = [];
  const title = `${h.emoji || "✓"} ${h.name}`;

  for (const rw of routineWeekdays) {
    for (const hm of times) {
      const { hour, minute } = parseReminderTime(hm);
      const trigger = computeTriggerForHabitWeekday(rw, hour, minute);
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body: "Нагадування про звичку",
            data: { habitId: h.id, routineWeekday: rw, time: hm },
          },
          // Layer Expo's `WeeklyTriggerInput` discriminator on top of
          // the domain shape produced by `computeTriggerForHabitWeekday`
          // (which deliberately stays Expo-agnostic). The expanded
          // object matches `WeeklyTriggerInput` exactly, so no cast.
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: trigger.weekday,
            hour: trigger.hour,
            minute: trigger.minute,
          },
        });
        if (typeof id === "string") out.push(id);
      } catch {
        /* noop — individual schedule failures shouldn't abort the rest */
      }
    }
  }

  return out;
}

/**
 * Cancel all reminders currently tracked in the MMKV map, clear the
 * map, and return the cleared map (empty) for the caller to adopt.
 */
async function cancelAllInternal(): Promise<ScheduledMap> {
  const current = readScheduledMap();
  const allIds = Object.values(current).flat();
  await cancelIds(allIds);
  writeScheduledMap({});
  return {};
}

/**
 * `useRoutineReminders` — wires the routine state into
 * `expo-notifications` weekly triggers.
 *
 * Mount the hook once at the top of `RoutineApp` (inside the
 * component, via `useEffect` — never at module scope, per the
 * Phase 5 constraints). Consumers outside the tree (e.g. HabitForm's
 * "reminder on" toggle) can call `reschedule()` / `requestPermission()`
 * by getting the return value from a shared provider in a follow-up
 * PR.
 */
export function useRoutineReminders(
  routine: RoutineState,
): UseRoutineRemindersApi {
  const [permission, setPermission] =
    useState<RoutineReminderPermission>("undetermined");
  const routineRef = useRef<RoutineState>(routine);
  const permissionRef = useRef<RoutineReminderPermission>(permission);
  const rescheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rescheduleInFlightRef = useRef<Promise<void> | null>(null);

  routineRef.current = routine;
  permissionRef.current = permission;

  // --- perform the real schedule/cancel work -----------------------------
  const performReschedule = useCallback(async (): Promise<void> => {
    if (!hasNotificationsModule()) return;
    if (permissionRef.current !== "granted") {
      // If permission was revoked between scheduling calls, wipe any
      // stale ids so cancelAll isn't called on no-ops forever.
      const prev = readScheduledMap();
      if (Object.keys(prev).length > 0) {
        await cancelIds(Object.values(prev).flat());
        writeScheduledMap({});
      }
      return;
    }

    const prev = readScheduledMap();
    // Cancel everything we previously owned — simpler and less
    // error-prone than diffing habit-by-habit. The cost is O(N)
    // native calls per reschedule, which is fine for the single-
    // digit habit counts we actually see.
    await cancelIds(Object.values(prev).flat());

    const next: ScheduledMap = {};
    const habits = routineRef.current.habits;
    for (const h of habits) {
      if (h.archived) continue;
      const ids = await scheduleHabit(h);
      if (ids.length > 0) next[h.id] = ids;
    }
    writeScheduledMap(next);
  }, []);

  const reschedule = useCallback(async (): Promise<void> => {
    // Collapse overlapping callers onto a single in-flight promise so
    // rapid draft toggles don't race the native scheduler.
    if (rescheduleInFlightRef.current) {
      return rescheduleInFlightRef.current;
    }
    const p = performReschedule().finally(() => {
      rescheduleInFlightRef.current = null;
    });
    rescheduleInFlightRef.current = p;
    return p;
  }, [performReschedule]);

  const cancelAll = useCallback(async (): Promise<void> => {
    if (!hasNotificationsModule()) return;
    await cancelAllInternal();
  }, []);

  const refreshPermission =
    useCallback(async (): Promise<RoutineReminderPermission> => {
      if (!hasNotificationsModule()) {
        setPermission("undetermined");
        return "undetermined";
      }
      try {
        const perm = await Notifications.getPermissionsAsync();
        const next = toPermission(perm);
        setPermission(next);
        return next;
      } catch {
        setPermission("undetermined");
        return "undetermined";
      }
    }, []);

  const requestPermission = useCallback(async (): Promise<void> => {
    if (!hasNotificationsModule()) return;
    try {
      const current = await Notifications.getPermissionsAsync();
      let next = toPermission(current);
      if (next !== "granted") {
        if (typeof Notifications.requestPermissionsAsync !== "function") {
          // No-op in non-Expo environments (Phase 5 requirement).
          setPermission(next);
          return;
        }
        const asked = await Notifications.requestPermissionsAsync();
        next = toPermission(asked);
      }
      setPermission(next);
      // Rescheduling is driven by the `[permission, routine.habits]`
      // effect below — flipping `permission` to "granted" triggers
      // a debounced reschedule without us calling it synchronously
      // here. Keeping the two paths in a single place makes it easier
      // to reason about "at most one in-flight reschedule per change".
    } catch {
      setPermission("undetermined");
    }
  }, []);

  // --- initial mount: read current permission --------------------------
  //
  // We deliberately do NOT call `reschedule()` here — flipping
  // `permission` to "granted" (when the user had already authorised in
  // a previous launch) schedules the reminder through the debounced
  // auto-reschedule effect below. This keeps the "what causes a
  // reschedule?" contract narrowed to a single place.
  useEffect(() => {
    void refreshPermission();
    // `refreshPermission` is stable (no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- debounced auto-reschedule on habit / prefs changes ----------------
  useEffect(() => {
    if (permission !== "granted") return undefined;
    if (rescheduleTimerRef.current) {
      clearTimeout(rescheduleTimerRef.current);
    }
    rescheduleTimerRef.current = setTimeout(() => {
      void reschedule();
    }, RESCHEDULE_DEBOUNCE_MS);
    return () => {
      if (rescheduleTimerRef.current) {
        clearTimeout(rescheduleTimerRef.current);
        rescheduleTimerRef.current = null;
      }
    };
  }, [routine.habits, permission, reschedule]);

  return { permission, requestPermission, reschedule, cancelAll };
}
