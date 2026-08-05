/**
 * Last validated: 2026-08-05
 * Status: Active
 *
 * Останній шанс дофлашити чергу синхронізації перед виходом з акаунта.
 *
 * AI-DANGER: `logout()` викликає `wipeSqliteDb()`, а це `pool.unlink()` —
 * повне видалення файлу локальної БД. Разом із файлом зникає
 * `sync_op_outbox`. Оскільки локальна БД — це ЄДИНИЙ екземпляр запису,
 * поки той не доїхав до Postgres, будь-який `pending`-рядок на момент
 * виходу втрачається назавжди: без попередження, без лічильника (банер
 * уже розмонтований), без можливості відновити.
 *
 * Реальний сценарій із аудиту шару даних 2026-08-05: людина в дорозі з
 * поганим звʼязком записує кілька витрат і перелогінюється — витрати
 * зникають.
 *
 * У коді вже існувала функція рівно під це — `purgeSyncOpOutboxForUser`,
 * і її докстрінг обіцяє «викликається на logout». Прод-викликів у неї
 * НУЛЬ: запобіжник написали й не підключили. Цей модуль закриває саме
 * той розрив, але протилежним способом — не вичищає чергу, а намагається
 * її доставити.
 *
 * Свідомо НЕ кидає: вихід не має падати через синхронізацію. Уся
 * діагностика — у поверненому результаті, і вже викликач вирішує, чи
 * питати користувача (див. `AuthContext.logout`).
 */
import { getSyncEngineWriter } from "./singleton";
import { logger } from "@shared/lib";

/**
 * Скільки чекаємо на доставку черги, перш ніж здатися і віддати рішення
 * користувачеві.
 *
 * 5 секунд — компроміс: на живій мережі пуш проходить за сотні
 * мілісекунд, тож людина нічого не помічає; довше тримати вихід
 * заблокованим гірше, ніж показати діалог. При мертвій мережі офлайн-гард
 * у `syncV2.pushLoop` поверне порожній результат майже миттєво, і ми
 * навіть не дочекаємось цього таймауту.
 */
export const LOGOUT_FLUSH_TIMEOUT_MS = 5_000;

export interface FlushBeforeLogoutResult {
  /**
   * Скільки записів лишилось недоставленими. `0` — можна безпечно
   * стирати локальну БД.
   */
  readonly pending: number;
  /**
   * `true`, якщо ми не змогли достукатись до рушія синхронізації або
   * перевірка впала. Тоді `pending` недостовірний і трактується як `0`
   * (fail-open): краще випустити людину з акаунта, ніж заблокувати вихід
   * через зламану телеметрію.
   */
  readonly unknown: boolean;
}

const SAFE: FlushBeforeLogoutResult = { pending: 0, unknown: false };

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Пробує доставити все, що стоїть у черзі, і повертає, скільки лишилось.
 *
 * Порядок навмисний: спершу дешева перевірка лічильника, і лише якщо
 * справді є що відправляти — дорогий `flushNow()`. Переважна більшість
 * виходів відбувається з порожньою чергою, і вони не мають платити ні
 * мережевим запитом, ні затримкою.
 */
export async function flushPendingSyncOpsBeforeLogout(
  timeoutMs: number = LOGOUT_FLUSH_TIMEOUT_MS,
): Promise<FlushBeforeLogoutResult> {
  const runtime = getSyncEngineWriter();
  // Рушій не піднятий (анонімна сесія, ранній вихід, вимкнена
  // синхронізація) — черги не існує, стирати безпечно.
  if (!runtime) return SAFE;

  try {
    const before = await withTimeout(runtime.getStatus(), timeoutMs);
    if (before === null) return { pending: 0, unknown: true };
    if (before.pending === 0) return SAFE;

    logger.info(
      `[auth.logout] flushing ${before.pending} pending sync op(s) before wipe`,
    );
    await withTimeout(runtime.flushNow(), timeoutMs);

    // Перечитуємо стан замість того, щоб довіряти результату пуша:
    // `flushNow` звітує про ОДИН батч (ліміт 100), а черга могла бути
    // довшою, і паралельний запис міг додати рядок уже після старту.
    const after = await withTimeout(runtime.getStatus(), timeoutMs);
    if (after === null) return { pending: 0, unknown: true };
    return { pending: after.pending, unknown: false };
  } catch (err) {
    // Fail-open: збій цієї перевірки не має ставати причиною, через яку
    // людина не може вийти з акаунта.
    logger.warn("[auth.logout] pre-wipe sync flush failed", err);
    return { pending: 0, unknown: true };
  }
}
