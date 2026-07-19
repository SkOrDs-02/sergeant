/**
 * Shared module-reminder machinery — ADR-0067 step 3.
 *
 * Owns three previously copy-pasted concerns:
 *   1. `useNotificationPermission` — Permissions API + visibility/focus fallback.
 *   2. `showReminderNotification` — SW show-with-Notification-ctor fallback.
 *   3. `useModuleReminder` — self-rescheduling per-minute timer that invokes
 *      `onMinuteTick` with **Kyiv-local** `dayKey`/`hm` when permission is
 *      granted and the hook is enabled.
 *
 * Each module wrapper keeps its own dedup logic, SW postMessages, and
 * module-specific side effects — this file deliberately knows nothing about
 * routines, workouts, or nutrition.
 *
 * @see docs/04-governance/adr/0067-engagement-mechanism-standardization.md
 */

import { useEffect, useState } from "react";
import { logger } from "@shared/lib";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";

// ── Permission tracker ──────────────────────────────────────────────────────

function readNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/**
 * Tracks the runtime `Notification.permission` state via the Permissions API
 * change-event with fallbacks on `visibilitychange` / `focus`. Stops the
 * scheduler on revoke, restarts on re-grant.
 *
 * Lifted verbatim from `useRoutineReminders.ts` (page-audit-09 F8).
 */
export function useNotificationPermission():
  NotificationPermission | "unsupported" {
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

// ── Shared show helper ──────────────────────────────────────────────────────

/**
 * Show a notification via the Service Worker registration (preferred — allows
 * the notification to outlive the page) with a direct `new Notification` ctor
 * fallback. Mirrors the logic previously duplicated across all three module
 * reminder hooks.
 */
export async function showReminderNotification(
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
    logger.warn("[module-reminder] sw-show-failed", err);
  }
  try {
    new Notification(title, { body, tag, requireInteraction: false });
  } catch (err) {
    logger.warn("[module-reminder] notification-ctor-failed", err);
  }
}

/**
 * Requests OS notification permission. Notification permission is per-origin
 * (shared across the whole app), so every module reminder toggle routes through
 * this single request rather than keeping a per-module copy.
 */
export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch (err) {
    logger.warn("[module-reminder] request-permission-failed", err);
    return "denied";
  }
}

// ── Per-minute scheduler ────────────────────────────────────────────────────

export interface ModuleReminderTick {
  /** Kyiv-local `YYYY-MM-DD` day key — use for dedup and day-boundary checks. */
  dayKey: string;
  /** Kyiv-local `HH:MM` — compare against the user's configured reminder time. */
  hm: string;
}

export interface UseModuleReminderOptions {
  /**
   * When `false` the timer is not started (saves resources when the module's
   * reminder setting is off). Must be `true` AND permission `"granted"` for
   * ticks to fire.
   */
  enabled: boolean;
  /**
   * Called once per minute when `enabled && permission === "granted"`.
   * Receives Kyiv-local `dayKey` and `hm`; do dedup + show inside here.
   */
  onMinuteTick: (tick: ModuleReminderTick) => void;
}

/**
 * Self-rescheduling per-minute reminder driver.
 *
 * Fires `onMinuteTick` at the top of each clock minute (±50 ms jitter budget)
 * with Kyiv-local `dayKey` and `hm` so callers never need to read host-local
 * time for day-boundary comparisons (ADR-0067 § Theme 1 fix).
 *
 * The sub-minute `getSeconds`/`getMilliseconds` reads ARE host-local — Kyiv's
 * UTC offset is a whole number of hours, so seconds/ms within a minute are
 * timezone-independent. The ESLint disable comments below mirror the routine
 * hook's precedent to document this deliberately.
 */
export function useModuleReminder({
  enabled,
  onMinuteTick,
}: UseModuleReminderOptions): void {
  const permission = useNotificationPermission();

  useEffect(() => {
    if (!enabled) return undefined;
    if (permission !== "granted") return undefined;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const fireAndSchedule = () => {
      if (disposed) return;
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;

      const now = Date.now();
      const { hour, minute } = getKyivDateParts(now);
      const dayKey = getKyivDayKey(now);
      const hm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

      onMinuteTick({ dayKey, hm });

      scheduleNext();
    };

    const scheduleNext = () => {
      if (disposed) return;
      // Sub-minute timer tick: секунди TZ-інваріантні (Kyiv-offset — ціла
      // кількість хвилин), тож host-local read тут не day-boundary bug —
      // це справжній wall-clock instant для розрахунку msToNextMinute.
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
  }, [enabled, permission, onMinuteTick]);
}
