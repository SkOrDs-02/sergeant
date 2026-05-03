import { useEffect, useRef } from "react";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { todayISODate } from "../lib/nutritionFormat";

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

  useEffect(() => {
    if (
      !prefs.reminderEnabled ||
      typeof window === "undefined" ||
      !("Notification" in window)
    )
      return;
    const tick = () => {
      if (Notification.permission !== "granted") return;
      const h = new Date().getHours();
      const target = prefs.reminderHour ?? 12;
      if (h !== target) return;
      const key = `${todayISODate()}-${target}`;
      if (lastNotifyKeyRef.current === key) return;
      lastNotifyKeyRef.current = key;
      writeLastNotifyKey(key);
      try {
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.ready
            .then((reg) => {
              reg.showNotification("🥗 Харчування", {
                body: "Час записати прийоми їжі.",
                tag: `nutrition-reminder-${key}`,
                icon: "/icon-192.png",
                badge: "/icon-192.png",
                requireInteraction: false,
                data: { action: "open", module: "nutrition" },
              });
            })
            .catch(() => {
              new Notification("🥗 Харчування", {
                body: "Час записати прийоми їжі.",
              });
            });
        } else {
          new Notification("🥗 Харчування", {
            body: "Час записати прийоми їжі.",
          });
        }
      } catch {
        /* ignore */
      }
    };
    const id = window.setInterval(tick, 45_000);
    tick();
    return () => window.clearInterval(id);
  }, [prefs.reminderEnabled, prefs.reminderHour]);
}
