import { useCallback, useEffect, useRef } from "react";
import { logger } from "@shared/lib";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";
import {
  safeListLSKeys,
  safeReadStringLS,
  safeRemoveLS,
  safeWriteLS,
} from "@shared/lib/storage/storage";
import {
  showReminderNotification,
  useModuleReminder,
} from "@shared/hooks/useModuleReminder";
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

export function useRoutineReminders(routine: RoutineState): void {
  const enabled = routine.prefs?.routineRemindersEnabled === true;
  const routineRef = useRef<RoutineState>(routine);
  routineRef.current = routine;

  useEffect(() => {
    cleanupStaleRoutineNotifyKeys();
  }, []);

  useEffect(() => {
    sendRoutineStateToSW(routine);
  }, [routine]);

  // `onMinuteTick` receives Kyiv-local dayKey + hm from the shared hook —
  // that is the bug fix: fizruk/nutrition previously read host-local time here.
  const onMinuteTick = useCallback(
    ({ dayKey: dk, hm }: { dayKey: string; hm: string }) => {
      const r = routineRef.current;
      if (r.prefs?.routineRemindersEnabled !== true) return;
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;

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
        showReminderNotification(title, body, storageKey);
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
    },
    // routineRef is intentionally not a dep — it's a stable ref that always
    // holds the latest value, avoiding re-creating onMinuteTick on every render.
    [],
  );

  useModuleReminder({ enabled, onMinuteTick });
}
