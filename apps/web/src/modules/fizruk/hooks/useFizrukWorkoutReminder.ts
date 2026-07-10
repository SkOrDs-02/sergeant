import { useCallback, useEffect, useRef } from "react";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import {
  showReminderNotification,
  useModuleReminder,
} from "@shared/hooks/useModuleReminder";

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

function sendFizrukStateToSW(state: FizrukReminderState): void {
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
 *
 * Bug fix (ADR-0067): dedup-key та due-check тепер використовують Kyiv-local
 * dayKey + hm з `useModuleReminder`, а не host-local `new Date().getHours()`.
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

  // Keep a stable ref so onMinuteTick closure doesn't need to list these as deps.
  const configRef = useRef({ reminderHour, reminderMinute });
  useEffect(() => {
    configRef.current = { reminderHour, reminderMinute };
  }, [reminderHour, reminderMinute]);

  useEffect(() => {
    sendFizrukStateToSW({
      reminderEnabled,
      reminderHour,
      reminderMinute,
      days,
    });
  }, [reminderEnabled, reminderHour, reminderMinute, days]);

  // `onMinuteTick` receives Kyiv-local dayKey + hm — this is the bug fix:
  // previously `new Date().getHours()` / `getMinutes()` used the host timezone.
  const onMinuteTick = useCallback(
    ({ dayKey, hm }: { dayKey: string; hm: string }) => {
      const { reminderHour: rh, reminderMinute: rm } = configRef.current;
      const targetHm = `${String(rh).padStart(2, "0")}:${String(rm).padStart(2, "0")}`;
      if (hm !== targetHm) return;

      if (firedRef.current === dayKey) return;

      // Optimistic in-memory guard so the per-minute tick doesn't double-fire
      // while the (async) notification is being shown. The day is persisted to
      // localStorage only AFTER a successful show — otherwise a failed
      // notification would permanently suppress today's reminder across
      // reloads. On failure we clear the in-memory guard so the next tick
      // retries.
      firedRef.current = dayKey;
      const persistFired = () => safeWriteLS(LAST_KEY, dayKey);
      const onShowFailed = () => {
        firedRef.current = null;
      };

      showReminderNotification(
        "Фізрук — тренування",
        "Заплановане тренування на сьогодні. Відкрий застосунок, щоб стартувати.",
        `fizruk-plan-${dayKey}`,
      )
        .then(persistFired)
        .catch(onShowFailed);
    },
    // configRef is a stable ref — intentionally not listed.
    [],
  );

  useModuleReminder({
    enabled: enabled && reminderEnabled,
    onMinuteTick,
  });
}
