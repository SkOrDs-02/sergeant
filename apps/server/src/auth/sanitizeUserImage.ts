/**
 * Sanitizes the `user.image` field before it lands in Postgres.
 *
 * Чому окремий модуль:
 *
 * Better Auth серіалізує цілий `user`-обʼєкт у session cookie cache
 * (HMAC-SHA256-підписаний JSON, base64-encoded; стратегія `compact`).
 * Якщо `user.image` — це embedded data-URL (наприклад,
 * `data:image/png;base64,...`), один cookie може зрости до десятків
 * кілобайт. Better Auth далі чанкує це у `__Secure-better-auth.session_data.0`,
 * `.1`, ... ` 4093` байт у кожному, і виплює 7+ Set-Cookie заголовків у
 * відповідь на `/sign-in/email`. Деякі проксі (Vercel edge → Railway →
 * iOS Safari) обробляють цей сценарій непоміченим тайм-аутом 90+ секунд;
 * клієнт бачить 504/«Сервер тимчасово недоступний» при правильному паролі.
 * Реальний інцидент — користувач з 19 286-байтним PNG у `user.image`
 * (зафіксовано у Sentry/Railway 2026-05-02).
 *
 * Філософія фікса:
 *
 * - **Не зберігаємо data: URL у БД.** Аватарки мають жити у CDN/обʼєктному
 *   сховищі та посилатись звичайним HTTPS URL-ом. Якщо клієнт надсилає
 *   `data:` — це баг клієнта, але ми не пускаємо це у `user.image`, інакше
 *   воно потім зламає логін через cookie-chunking.
 * - **Не приймаємо абсурдно довгі URL-и.** Навіть HTTPS-URL > 2 КБ — це
 *   або помилка, або зловживання. CDN-посилання у нас < 200 символів.
 * - **Стрипати > відхиляти.** Якщо інше поле `update`-у валідне (наприклад
 *   юзер оновлює name + image одночасно), ми не падаємо весь запит, а лише
 *   нулимо `image` і логимо WARN. Користувач все одно бачить «оновлено»,
 *   тільки аватарка лишається старою.
 *
 * Використання — у `auth.ts`:
 *
 * ```ts
 * databaseHooks: {
 *   user: {
 *     create: { before: async (data) => ({ data: sanitizeUserImage(data) }) },
 *     update: { before: async (data) => ({ data: sanitizeUserImage(data) }) },
 *   },
 * },
 * ```
 *
 * Тестова поверхня: `sanitizeUserImage.test.ts`.
 */

const MAX_IMAGE_URL_LENGTH = 2048;

export interface SanitizeResult<T> {
  /** Дані для запису у БД (мутацій-копія input-у з можливо `image: null`). */
  data: T;
  /**
   * Чи було вирізано image-поле. Caller (auth.ts) логує WARN — щоб метрики
   * `auth_event` показували, що захист спрацював і ми знали, які клієнти
   * шлють лайно.
   */
  imageStripped: boolean;
  /**
   * Причина вирізання. Допомагає в тріажі: `data_url` сигналить про
   * клієнт-баг (треба фіксити upload-pipeline у `apps/web` чи `apps/mobile`),
   * `too_long` — зазвичай OAuth-провайдер повернув якийсь фірмовий
   * URL із query-частиною на кілька КБ.
   */
  reason: "data_url" | "too_long" | null;
}

/**
 * Перевіряє та (за потреби) стрипає `image` з payload-у user-write-у.
 *
 * Контракт:
 * - input не мутується;
 * - якщо `image` відсутнє у data — виходимо з `imageStripped: false`,
 *   нічого не змінюємо (часта гілка для оновлень типу `name`-only);
 * - якщо `image` — `null` / порожній рядок / не-string — пропускаємо без
 *   змін (це валідний стан «без аватарки»);
 * - якщо `image` — рядок, що починається з `data:` (case-insensitive) →
 *   `image: null`, `reason: "data_url"`;
 * - якщо `image.length > MAX_IMAGE_URL_LENGTH` → `image: null`,
 *   `reason: "too_long"`;
 * - інакше — без змін.
 *
 * Generic `T` тримає тип callerа (наприклад, Better Auth-івський
 * `Partial<User>`, який прилітає у `databaseHooks.user.{create,update}.before`).
 * Приймаємо будь-що, що розширює `Record<string, unknown>`, і повертаємо
 * той самий `T`, щоб type-safety продовжилася по ланцюжку hook-у без
 * зайвого кастингу.
 */
export function sanitizeUserImage<T extends Record<string, unknown>>(
  data: T,
): SanitizeResult<T> {
  // Швидкий вихід: image не задається у цьому write-і — нічого не робимо.
  if (!("image" in data)) {
    return { data, imageStripped: false, reason: null };
  }

  const value = data.image;

  // null / undefined / "" / non-string → це валідний «нема аватарки»,
  // або поле не є string і нас не стосується (Better Auth у такому разі
  // сам обробить тип-перевіркою).
  if (typeof value !== "string" || value.length === 0) {
    return { data, imageStripped: false, reason: null };
  }

  // Регулярка не годиться: `^data:` через `.startsWith` без alloc, плюс
  // нечутливо до регістру. RFC 2397 дозволяє будь-який медіа-тип, тож
  // не звужуємо перевірку до `image/`.
  if (value.toLowerCase().startsWith("data:")) {
    return {
      data: { ...data, image: null } as T,
      imageStripped: true,
      reason: "data_url",
    };
  }

  if (value.length > MAX_IMAGE_URL_LENGTH) {
    return {
      data: { ...data, image: null } as T,
      imageStripped: true,
      reason: "too_long",
    };
  }

  return { data, imageStripped: false, reason: null };
}

export const __testing = {
  MAX_IMAGE_URL_LENGTH,
};
