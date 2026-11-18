/**
 * Пояс пристрою → `user_preferences.time_zone`.
 *
 * Спека: docs/work/specs/notifications-quiet-hours-and-device-time.md.
 *
 * Серверний прохід нагадувань і вебхук Monobank рахують час нагадувань і
 * тихі години в поясі пристрою людини, а знати його сервер може лише від
 * клієнта. На старті й щоразу, коли вкладка знову стає видимою, хук читає
 * налаштування і, якщо збережений пояс відрізняється від поясу пристрою,
 * патчить лише його. Останній пристрій, що писав, виграє (LWW, ADR-0078 § 4).
 *
 * Старий сервер (у вікні між деплоєм веба і бекенду) поля `timeZone` не
 * віддає і відхилив би патч із ним `400` (`.strict()`): тоді хук нічого не
 * шле і пробує знову на наступному старті чи поверненні на вкладку.
 *
 * Звичайний `useEffect`-fetch, а не React Query: як і решта boot-читань
 * `/api/me/preferences` (`useHubPrefsSync`, `useAnalyticsConsentBoot`), це
 * разове читання, а не спільний кешований ресурс.
 */
import { useEffect } from "react";
import { meApi } from "@shared/api";
import { logger } from "@shared/lib";
import { useAuth } from "../auth/AuthContext";

/** IANA-пояс пристрою або `null`, якщо рушій його не віддає. */
export function readDeviceTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.length > 0 && tz.length <= 64
      ? tz
      : null;
  } catch {
    return null;
  }
}

export function useDeviceTimeZoneSync(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return undefined;
    let disposed = false;
    let inFlight = false;

    const sync = async () => {
      if (disposed || inFlight) return;
      const deviceTz = readDeviceTimeZone();
      if (!deviceTz) return;
      inFlight = true;
      try {
        const prefs = await meApi.getPreferences();
        if (disposed) return;
        // Ключа немає = старий сервер; `null` = новий сервер, пояс невідомий.
        if (prefs.timeZone === undefined) return;
        if (prefs.timeZone === deviceTz) return;
        await meApi.updatePreferences({ timeZone: deviceTz });
      } catch (err) {
        logger.warn("[timeZone] device time zone sync failed", err);
      } finally {
        inFlight = false;
      }
    };

    void sync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId]);
}
