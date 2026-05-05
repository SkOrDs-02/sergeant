/**
 * Спільні типи, що використовуються і на клієнті, і на сервері.
 *
 * Більшість доменних типів виводимо з Zod-схем через `z.infer`; сюди йдуть
 * лише ті, що не мають прямого Zod-відповідника (utility, union, cross-
 * package контракти без валідації).
 */

/**
 * Універсальний контракт вхідного push-payload-а для `sendToUser(userId, payload)`
 * на сервері.
 *
 * Один shape для iOS/Android/Web — сервер сам мапить поля у APNs-aps /
 * FCM-notification / web-push JSON відповідно:
 *
 *   - `title`/`body` → APNs `aps.alert.{title,body}`, FCM `notification.{title,body}`,
 *     web-push JSON `{title, body}`.
 *   - `data`        → APNs custom root keys, FCM `data` (stringified values), web-push
 *                     JSON inline.
 *   - `badge`       → APNs `aps.badge` (iOS app-icon counter). Android не має аналогу.
 *   - `threadId`    → APNs `aps.thread-id` — групування нотифікацій у одну
 *                     «розмову» на iOS. На інших платформах ігнорується.
 *   - `url`         → deep-link, який клієнт відкриває при тапі. Сервер кладе
 *                     у `data.url` (для всіх трьох каналів), щоб native/web
 *                     handler читали з одного ключа. Якщо передано і `data.url`,
 *                     і top-level `url` — top-level виграє.
 *   - `silent`      → «безшумний» background-push: iOS отримує
 *                     `aps.content-available=1` з заголовком `apns-push-type:
 *                     background` і `apns-priority: 5` (Apple вимагає обидва,
 *                     інакше APNs або відхилить, або доставить як звичайний
 *                     alert); Android/FCM — data-only повідомлення без блоку
 *                     `notification`, щоб ОС не показала банер. Web-push гілка
 *                     silent НЕ інтерпретує (її service-worker сам вирішує, що
 *                     показати) — поле просто не впливає на web-payload.
 *
 * Контракт винесено в `@sergeant/shared` (а не тримано лише на сервері), щоб
 * mobile/web handler-и могли типізувати свою сторону (payload.data у JS-коді
 * клієнта) без дублювання форми.
 */
export interface PushPayload {
  /** Заголовок нотифікації. Обов'язковий — всі три канали його вимагають. */
  title: string;
  /** Основний текст нотифікації. Порожній рядок — валідний. */
  body?: string | undefined;
  /** Додаткові дані клієнтського handler-а (серіалізуються у JSON). */
  data?: Record<string, unknown> | undefined;
  /** Бейдж iOS (число на іконці застосунку). Нуль скидає бейдж. */
  badge?: number | undefined;
  /** APNs `thread-id` — групує нотифікації у одному threadі на iOS. */
  threadId?: string | undefined;
  /**
   * Deep-link, на який клієнт перейде при тапі. Сервер прокидає у
   * `data.url` без інтерпретації; сам роутинг — на стороні mobile/web
   * handler-а. Top-level `url` має пріоритет над `data.url`.
   */
  url?: string | undefined;
  /**
   * Background/silent push: прокидає дані без UI-банера.
   *
   *   - APNs: `aps.content-available=1`, `apns-push-type: background`,
   *     `apns-priority: 5`, без `aps.alert`. Apple відхилить alert-шлях,
   *     якщо `content-available=1` присутній без цих заголовків.
   *   - FCM:  `message.data` (stringified) без `message.notification`,
   *     плюс `android.priority=high` для wake-up.
   *   - Web:  silent ігнорується (service-worker сам вирішує, що показати).
   */
  silent?: boolean | undefined;
}
