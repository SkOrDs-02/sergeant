/**
 * Last validated: 2026-10-23
 * Status: Active
 *
 * Локальне сповіщення про кінець відпочинку (рішення власника 2026-10-23,
 * аудит `logic-10`): Notification API, без Web Push і без серверу.
 *
 * Показуємо лише коли обидві умови виконані:
 *   1. вкладка прихована — на видимій сторінці сигналом є звук і вібрація
 *      (`useFizrukRestSound`), друге сповіщення там лише дублює;
 *   2. дозвіл УЖЕ наданий (`granted`). Дозвіл тут не запитується: запит —
 *      лише явною дією людини (тумблер нагадувань у налаштуваннях), а не
 *      посеред тренування, коли таймер дійшов до нуля.
 *
 * AI-CONTEXT: це не фонове сповіщення. Сторінка мусить виконувати JS у момент
 * кінця: Chrome на Android тротлить приховану вкладку, але тік доходить;
 * iOS на заблокованому екрані JS призупиняє, і тоді сповіщення не буде —
 * таймер досинхронізується на `visibilitychange` вже на видимій сторінці
 * (там грає звук). Для заблокованого iPhone потрібен Web Push, і це окреме
 * рішення.
 */
import { showReminderNotification } from "@shared/hooks/useModuleReminder";
import { messages } from "@shared/i18n/uk";

/** Один тег на всі відпочинки: нове сповіщення замінює старе, а не множиться. */
export const REST_NOTIFICATION_TAG = "fizruk-rest-timer";

export function notifyRestFinishedIfHidden(): boolean {
  if (typeof document === "undefined") return false;
  if (document.visibilityState !== "hidden") return false;
  if (typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;
  const t = messages.fizruk.restTimer;
  void showReminderNotification(
    t.finished,
    t.notificationBody,
    REST_NOTIFICATION_TAG,
  );
  return true;
}
