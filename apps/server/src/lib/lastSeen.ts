import pool from "../db.js";
import { env } from "../env/env.js";
import { logger } from "../obs/logger.js";

/**
 * Трекінг останнього візиту (`"user".last_seen_at`, міграція 100).
 *
 * Єдиний споживач — шедулер проактивних пушів Сержанта: без цього поля він
 * не може відрізнити «юзер не заходить третій день» від «юзер зараз в апці»,
 * а вимога власника — будити ЛИШЕ тих, хто не заходить.
 *
 * Точність тут навмисно груба. Шедулер порівнює київські ДОБИ, тож писати
 * частіше ніж раз на годину — це навантаження на БД заради знаків, які
 * ніхто не прочитає. Throttle тримається в памʼяті процесу: втрата кешу на
 * рестарті коштує одного зайвого UPDATE на юзера, а не коректності.
 *
 * Свідомо НЕ використовуємо `session."updatedAt"` від Better Auth: він
 * оновлюється за власною логікою продовження сесії, а не за фактом візиту,
 * тож давав би хибні пуші.
 */

/** Мінімальний інтервал між двома записами для одного юзера. */
const TOUCH_THROTTLE_MS = 60 * 60_000;

const lastTouchedAt = new Map<string, number>();

/**
 * Обмежувач росту мапи. Один запис — рядок id плюс число, тож навіть
 * 50k активних юзерів це одиниці мегабайт; але процес живе тижнями, і без
 * стелі мапа накопичує id-и всіх, хто колись заходив. При переповненні
 * чистимо повністю: наслідок — по одному зайвому UPDATE на юзера, що вже
 * є прийнятною ціною за рестарт.
 */
const MAX_TRACKED_USERS = 50_000;

/**
 * Позначає юзера як активного. Fire-and-forget: помилка запису ніколи не
 * повинна валити запит, задля якого викликана — це телеметрія, не бізнес-дані.
 *
 * Викликається з `requireSession` / `requireSessionSoft` після успішного
 * резолву сесії.
 */
export function touchLastSeen(userId: string): void {
  if (!env.LAST_SEEN_TRACKING_ENABLED) return;
  const now = Date.now();
  const previous = lastTouchedAt.get(userId);
  if (previous !== undefined && now - previous < TOUCH_THROTTLE_MS) return;

  if (lastTouchedAt.size >= MAX_TRACKED_USERS) lastTouchedAt.clear();
  // Ставимо мітку ДО await-у: інакше десяток паралельних запитів одного
  // юзера проскочить перевірку разом і зробить десяток однакових UPDATE.
  lastTouchedAt.set(userId, now);

  // `setImmediate`, а не прямий виклик: ця функція живе у middleware, тобто
  // виконується ПЕРЕД хендлером. Без відкладення телеметрія забирала б
  // зʼєднання з пулу поперед запитом, заради якого користувач узагалі
  // прийшов, і додавала б свою латентність до кожного роуту. Відкладення на
  // наступний тік event-loop-у пускає хендлер першим — а більше ця мітка
  // нікому не потрібна, її читає добовий прохід.
  setImmediate(() => {
    void pool
      .query(`UPDATE "user" SET last_seen_at = NOW() WHERE id = $1`, [userId])
      .catch((err: unknown) => {
        // Знімаємо мітку, щоб наступний запит спробував ще раз, а не чекав
        // годину на повторну спробу після одноразового збою пулу.
        lastTouchedAt.delete(userId);
        logger.warn({
          msg: "last_seen_touch_failed",
          err: err instanceof Error ? err.message : String(err),
        });
      });
  });
}

/** Скидає throttle-кеш. Лише для тестів. */
export function __resetLastSeenThrottleForTests(): void {
  lastTouchedAt.clear();
}
