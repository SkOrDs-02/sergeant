import { useCallback, useEffect, useRef } from "react";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import {
  showReminderNotification,
  useModuleReminder,
} from "@shared/hooks/useModuleReminder";

export interface NutritionReminderPrefs {
  reminderEnabled: boolean;
  reminderHour?: number | null;
}

const LAST_NOTIFY_KEY_STORAGE = "nutrition_last_reminder_notif_key";

function readLastNotifyKey(): string {
  return safeReadStringLS(LAST_NOTIFY_KEY_STORAGE, "") ?? "";
}

function writeLastNotifyKey(key: string): void {
  safeWriteLS(LAST_NOTIFY_KEY_STORAGE, key);
}

export function useNutritionReminders(prefs: NutritionReminderPrefs): void {
  // Seed from localStorage so a remount within the same reminder window
  // (e.g. navigating away from nutrition and back) does not re-fire the
  // same day's notification.
  const lastNotifyKeyRef = useRef<string>(readLastNotifyKey());

  // Keep a stable ref so onMinuteTick doesn't need to list prefs as a dep.
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    try {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "NUTRITION_STATE_UPDATE",
          data: {
            reminderEnabled: prefs.reminderEnabled,
            reminderHour: prefs.reminderHour ?? 12,
          },
        });
      }
    } catch {
      /* ignore */
    }
  }, [prefs.reminderEnabled, prefs.reminderHour]);

  // `onMinuteTick` receives Kyiv-local dayKey + hm — this is the bug fix:
  // previously `new Date().getHours()` used the host timezone.
  const onMinuteTick = useCallback(
    ({ dayKey, hm }: { dayKey: string; hm: string }) => {
      const target = prefsRef.current.reminderHour ?? 12;
      // The user configures an hour only (no minute), so fire on the first
      // foreground tick during the target Kyiv HOUR — matching the original
      // `getHours() === target` window — deduped once per day via the key
      // below. Comparing the full `hm` against `HH:00` would narrow this to a
      // single minute and silently drop the reminder when the app is opened
      // mid-hour.
      const hourNum = Number(hm.slice(0, 2));
      if (hourNum !== target) return;

      const key = `${dayKey}-${target}`;
      if (lastNotifyKeyRef.current === key) return;
      lastNotifyKeyRef.current = key;
      writeLastNotifyKey(key);

      showReminderNotification(
        "Харчування",
        "Час записати прийоми їжі.",
        `nutrition-reminder-${key}`,
      ).catch(() => {
        /* ignore */
      });
    },
    // prefsRef is a stable ref — intentionally not listed.
    [],
  );

  useModuleReminder({
    enabled: prefs.reminderEnabled,
    onMinuteTick,
  });
}
