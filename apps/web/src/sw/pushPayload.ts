/**
 * Нормалізація вхідного web-push payload-у.
 *
 * Виокремлено з `sw.ts` (той самий підхід, що й `./cache`, `./messages`,
 * `./notifiedKeys`) з двох причин: сервіс-воркер не можна змонтувати у
 * Vitest, а саме тут живе історія розбіжності контракту, яку варто
 * зафіксувати тестами.
 *
 * ── Контекст ────────────────────────────────────────────────────────────
 *
 * Історично існували ДВА несумісні формати, і SW розумів лише другий:
 *
 *   1. `sendToUser` (`apps/server/src/push/send.ts`) — канонічний
 *      `PushPayload`: `{title, body, data: {module, url, …}, tag?}`.
 *      Ним ідуть УСІ реальні пуші: mono-вебхук, `/api/push/test`,
 *      серверні нагадування.
 *   2. Внутрішній `POST /api/push/send` — плаский `{title, body, module, tag}`.
 *
 * SW читав `module`/`tag` лише з верхнього рівня. Тому в кожного пушу з
 * формату (1) `tag` виявлявся порожнім — сповіщення не заміщували одне
 * одного, а накопичувались стосом, — а `module` був `null`, тож тап
 * відкривав корінь застосунку замість модуля. `data.url` не читався взагалі,
 * тобто deep-link не працював у жодному пуші.
 *
 * Тепер вкладена форма канонічна, плоска лишається як fallback — обидва
 * відправники поводяться однаково.
 */

/**
 * Форма push-payload-у після `event.data.json()`. Усі поля опційні: це
 * мережевий вхід, а не наш тип.
 */
export interface SwPushPayload {
  title?: string;
  body?: string;
  tag?: string;
  module?: string;
  data?: { module?: string; url?: string; tag?: string } | null;
}

/** Готові поля для `registration.showNotification(title, options)`. */
export interface NormalizedPush {
  title: string;
  body: string;
  tag: string;
  module: string | null;
  url: string | null;
}

/**
 * Audit 2026-05-13 §F9: захисні обрізки над payload-ом, який контролює
 * зловмисник. Payload підписаний VAPID, але компрометація ключа означала б
 * виконання довільних `title`/`body`. Ріжемо довжину і вирізаємо
 * BiDi-overrides (U+202A..U+202E, U+2066..U+2069) та zero-width-символи
 * (U+200B..U+200D, U+FEFF), якими роблять візуальний спуфінг.
 */
export function sanitize(input: unknown, max: number): string {
  return String(input ?? "")
    .replace(/[\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]/g, "")
    .slice(0, max);
}

/**
 * Audit 2026-05-13 §F8: allow-list модулів. Без нього рядок із мережі
 * потрапляє прямо в URL і в `postMessage` до сторінки.
 */
export const ALLOWED_NOTIFICATION_MODULES: ReadonlySet<string> = new Set([
  "finyk",
  "fizruk",
  "nutrition",
  "routine",
]);

/**
 * Звузити довільний рядок із push-payload-у до безпечного same-origin шляху.
 *
 * `clients.openWindow` радо відкриє `https://evil.example` або `javascript:`,
 * тобто без цієї перевірки нотифікація стає вектором фішингу. Пропускаємо
 * лише рядки, що починаються з одного `/`; `//host` — protocol-relative URL
 * на чужий origin, тож відсікається окремо.
 */
export function safeNotificationPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.length > 512) return null;
  return raw;
}

/**
 * Привести payload обох форматів до полів нотифікації.
 *
 * `tagFallback` існує, щоб не смикати `Date.now()` усередині чистої функції:
 * викликач (SW) підставляє свій, тести — детермінований.
 */
export function normalizePushPayload(
  payload: SwPushPayload,
  tagFallback: string,
): NormalizedPush {
  const nested = payload.data ?? null;
  // Вкладений `data.tag` — найнижчий пріоритет: канонічний шлях кладе tag
  // на верхній рівень, а `data` лишається вільним полем відправника.
  const rawTag = payload.tag ?? nested?.tag;
  const rawModule = nested?.module ?? payload.module;
  const module = sanitize(rawModule, 32);
  return {
    title: sanitize(payload.title, 80) || "Мій простір",
    body: sanitize(payload.body, 200),
    tag: sanitize(rawTag, 120) || tagFallback,
    module: module && ALLOWED_NOTIFICATION_MODULES.has(module) ? module : null,
    url: safeNotificationPath(nested?.url),
  };
}
