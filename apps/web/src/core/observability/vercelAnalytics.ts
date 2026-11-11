import type { BeforeSendEvent } from "@vercel/analytics/react";
import { getAnalyticsConsent } from "./analyticsConsent";

/**
 * `beforeSend` для Vercel Web Analytics. Скрипт `<Analytics />` після
 * монтування трекає навігації сам і демонтуванням не зупиняється, тож згоду
 * перевіряємо на кожній події: до «Дозволити» і після відкликання нічого не
 * летить. Адресу шлемо без query і hash: там бувають токени (`?token=`) і
 * пошукові запити.
 */
export function vercelAnalyticsBeforeSend(
  event: BeforeSendEvent,
): BeforeSendEvent | null {
  if (!getAnalyticsConsent()) return null;
  return { ...event, url: event.url.split(/[?#]/)[0] ?? event.url };
}
