import { useEffect, useRef, useState } from "react";
import { logger } from "@shared/lib";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";
import {
  safeListLSKeys,
  safeReadStringLS,
  safeRemoveLS,
  safeWriteLS,
} from "@shared/lib/storage/storage";
import { habitScheduledOnDate } from "../lib/hubCalendarAggregate";
import { normalizeReminderTimes } from "../lib/routineDraftUtils";
import {
  getRoutineReminderPrivacy,
  reminderNotificationContent,
} from "../lib/reminderPrivacy";
import type { RoutineState } from "../lib/types";

export const ROUTINE_NOTIFY_PREFIX = "routine_notify_";

export function cleanupStaleRoutineNotifyKeys(maxAgeDays = 45): void {
  // Notify-keys стораться як Kyiv day-keys (`routine_notify_…-YYYY-MM-DD`),
  // тож cutoff теж рахуємо в Europe/Kyiv — `toISOString().slice(0, 10)` дав би
  // UTC-дату й біля півночі за київським часом зрізав би не той день
  // (page-audit-09 F21). Віднімаємо `maxAgeDays` календарних днів від київської
  // civil-дати (а не фіксовані 24h-мілісекунди) — `Date.UTC` нормалізує
  // overflow, тож DST-перехід у вікні не зсуває cutoff на день.
  const { year, month, day } = getKyivDateParts(Date.now());
  const cutoffKey = getKyivDayKey(
    new Date(Date.UTC(year, month - 1, day - maxAgeDays, 12, 0, 0)),
  );
  for (const k of safeListLSKeys()) {
    if (!k.startsWith(ROUTINE_NOTIFY_PREFIX)) continue;
    const m = k.match(/(\d{4}-\d{2}-\d{2})$/);
    const d = m?.[1];
    if (d && d < cutoffKey) safeRemoveLS(k);
  }
}

function todayKey() {
  // Day-key for reminder-dedup must be Kyiv-local (same as the notify-key
  // cleanup cutoff above): `dateKeyFromDate(new Date())` reads host-local
  // civil-date and would dedup against the wrong day near Kyiv midnight for
  // a user abroad (page-audit-09 F21, Theme 1).
  return getKyivDayKey();
}

function currentHm() {
  // Theme 1: routine reminders fire on Kyiv-local HH:MM so a user
  // travelling abroad still gets the same "8:00" reminder they
  // configured in Kyiv, instead of one shifted by the host clock.
  const { hour, minute } = getKyivDateParts(Date.now());
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function showNotification(
  title: string,
  body: string,
  tag: string,
): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        tag,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        requireInteraction: false,
      });
      return;
    }
  } catch (err) {
    logger.warn("[routine.reminders] sw-show-failed", err);
  }
  try {
    new Notification(title, { body, tag, requireInteraction: false });
  } catch (err) {
    logger.warn("[routine.reminders] notification-ctor-failed", err);
  }
}

function sendRoutineStateToSW(routine: RoutineState): void {
  try {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller)
      return;
    navigator.serviceWorker.controller.postMessage({
      type: "ROUTINE_STATE_UPDATE",
      data: {
        habits: routine.habits,
        completions: routine.completions,
        prefs: routine.prefs,
      },
    });
  } catch (err) {
    logger.warn("[routine.reminders] sw-state-postmessage-failed", err);
  }
}

function readNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/**
 * Audit F8: відстежує runtime `Notification.permission` через
 * Permissions API change-event + fallback на `visibilitychange`/`focus`,
 * щоб scheduler коректно стопився на revoke і рестартував на re-grant.
 */
function useNotificationPermission(): NotificationPermission | "unsupported" {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() =>
    readNotificationPermission(),
  );

  useEffect(() => {
    if (typeof Notification === "undefined") return undefined;
    let disposed = false;
    const sync = () => {
      if (disposed) return;
      const next = readNotificationPermission();
      setPerm((prev) => (prev === next ? prev : next));
    };

    sync();

    let permStatus: PermissionStatus | null = null;
    const onPermChange = () => sync();
    try {
      const permissions = navigator.permissions;
      if (permissions && typeof permissions.query === "function") {
        permissions
          .query({ name: "notifications" as PermissionName })
          .then((status) => {
            if (disposed) return;
            permStatus = status;
            status.addEventListener("change", onPermChange);
            sync();
          })
          .catch(() => {
            /* Permissions API недоступна — лишається fallback */
          });
      }
    } catch {
      /* Safari старіших версій кидає на name="notifications" — fallback */
    }

    const onVisibility = () => sync();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      if (permStatus) {
        try {
          permStatus.removeEventListener("change", onPermChange);
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  return perm;
}

export function useRoutineReminders(routine: RoutineState): void {
  const enabled = routine.prefs?.routineRemindersEnabled === true;
  const permission = useNotificationPermission();
  const routineRef = useRef<RoutineState>(routine);
  routineRef.current = routine;

  useEffect(() => {
    cleanupStaleRoutineNotifyKeys();
  }, []);

  useEffect(() => {
    sendRoutineStateToSW(routine);
  }, [routine]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (permission !== "granted") return undefined;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const fireAndSchedule = () => {
      if (disposed) return;
      const r = routineRef.current;
      if (r.prefs?.routineRemindersEnabled !== true) return;
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;

      const dk = todayKey();
      const hm = currentHm();

      for (const h of r.habits) {
        if (h.archived) continue;
        const times = normalizeReminderTimes(h);
        if (times.length === 0) continue;
        if (!times.includes(hm)) continue;
        if (!habitScheduledOnDate(h, dk)) continue;
        const completions = r.completions[h.id] || [];
        if (completions.includes(dk)) continue;

        const storageKey = `${ROUTINE_NOTIFY_PREFIX}${h.id}_${hm}_${dk}`;
        if (safeReadStringLS(storageKey, null)) continue;

        const { title, body } = reminderNotificationContent(
          h,
          getRoutineReminderPrivacy(r.prefs),
        );
        showNotification(title, body, storageKey);
        // `safeWriteLS` keeps raw strings as-is (no JSON.stringify), so the
        // stored value matches the legacy `localStorage.setItem(_, "1")`
        // shape that `safeReadStringLS(_) → "1"` then short-circuits on
        // re-entry above.
        safeWriteLS(storageKey, "1");
        try {
          if (navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: "ROUTINE_NOTIFICATION_SENT",
              data: { storageKey },
            });
          }
        } catch (err) {
          logger.warn("[routine.reminders] sw-sent-postmessage-failed", err);
        }
      }

      scheduleNext();
    };

    const scheduleNext = () => {
      if (disposed) return;
      // Sub-minute timer tick: секунди TZ-інваріантні (Kyiv-offset — ціла
      // кількість хвилин), тож host-local read тут не day-boundary bug —
      // це справжній wall-clock instant для розрахунку msToNextMinute.
      // eslint-disable-next-line no-restricted-syntax -- wall-clock instant for sub-minute timer alignment, not a day key
      const now = new Date();
      // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- sub-minute scheduling, not a day key
      const secondsIntoMinute = now.getSeconds();
      const msToNextMinute =
        (60 - secondsIntoMinute) * 1000 - now.getMilliseconds() + 50;
      timerId = setTimeout(fireAndSchedule, msToNextMinute);
    };

    fireAndSchedule();

    return () => {
      disposed = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [enabled, permission]);
}

export async function requestRoutineNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch (err) {
    logger.warn("[routine.reminders] request-permission-failed", err);
    return "denied";
  }
}
