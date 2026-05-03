import { useEffect, useRef } from "react";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";

const LAST_KEY = "fizruk_last_reminder_notif_day";

function readLastFiredDay(): string | null {
  return safeReadStringLS(LAST_KEY);
}

interface FizrukReminderState {
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  days: Record<string, unknown>;
}

export function sendFizrukStateToSW(state: FizrukReminderState): void {
  try {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller)
      return;
    navigator.serviceWorker.controller.postMessage({
      type: "FIZRUK_STATE_UPDATE",
      data: state,
    });
  } catch {}
}

/**
 * Локальне нагадування (через Notification API, якщо дозволено).
 * `enabled` — на сьогодні є запис у календарі плану.
 */
export function useFizrukWorkoutReminder({
  enabled,
  reminderHour,
  reminderMinute,
  reminderEnabled,
  days,
}: {
  enabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  reminderEnabled: boolean;
  days: Record<string, unknown>;
}) {
  // Seed from localStorage so that remount within the same day (e.g. after
  // HMR, route change, or the user navigating away and back) does not
  // re-fire today's notification.
  const firedRef = useRef<string | null>(readLastFiredDay());

  useEffect(() => {
    sendFizrukStateToSW({
      reminderEnabled,
      reminderHour,
      reminderMinute,
      days,
    });
  }, [reminderEnabled, reminderHour, reminderMinute, days]);

  useEffect(() => {
    if (!enabled) return;
    if (!reminderEnabled) return;

    const tick = () => {
      const now = new Date();
      if (
        now.getHours() !== reminderHour ||
        now.getMinutes() !== reminderMinute
      )
        return;

      const dayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      if (firedRef.current === dayStr) return;

      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;

      firedRef.current = dayStr;
      safeWriteLS(LAST_KEY, dayStr);

      try {
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.ready
            .then((reg) => {
              reg.showNotification("🏋️ Фізрук — тренування", {
                body: "Заплановане тренування на сьогодні. Відкрий застосунок, щоб стартувати.",
                tag: `fizruk-plan-${dayStr}`,
                icon: "/icon-192.png",
                badge: "/icon-192.png",
                requireInteraction: false,
                data: { action: "open", module: "fizruk" },
              });
            })
            .catch(() => {
              new Notification("🏋️ Фізрук — тренування", {
                body: "Заплановане тренування на сьогодні. Відкрий застосунок, щоб стартувати.",
                tag: "fizruk-plan",
              });
            });
        } else {
          new Notification("🏋️ Фізрук — тренування", {
            body: "Заплановане тренування на сьогодні. Відкрий застосунок, щоб стартувати.",
            tag: "fizruk-plan",
          });
        }
      } catch {}
    };

    const id = setInterval(tick, 30_000);
    tick();
    return () => clearInterval(id);
  }, [enabled, reminderEnabled, reminderHour, reminderMinute]);
}
