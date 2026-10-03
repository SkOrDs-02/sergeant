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
 * Що рахується втратою (аудит 2026-10-01, `data-19`): `pending` (включно з
 * тими, що в бекофі) + `dead_letter` + не-benign `rejected` ПОТОЧНОГО
 * користувача. Раніше рахувався лише `pending`, а `dead_letter` (сервер так і
 * не прийняв — після 10-15 хв поганої мережі уся черга опиняється тут) і
 * `rejected` стирались мовчки навіть зі сторінки Профілю. Лічильник читається
 * прямо з БД, а не з рантайму синку: рантайм може бути не піднятий (бут
 * упав), і тоді «рушія немає» не означає «черги немає».
 *
 * Перед тим як здатися, модуль СПРОБУЄ доставити: скидає бекоф `pending`,
 * оживляє `dead_letter` (одна додаткова спроба) і жене `flushNow()` у циклі,
 * доки черга зменшується і не вичерпано бюджет часу. Один `flushNow()` —
 * це лише один батч (100) і лише «due» рядки, цього мало.
 *
 * Свідомо НЕ кидає: вихід не має падати через синхронізацію. Уся
 * діагностика — у поверненому результаті, і вже викликач вирішує, чи
 * питати користувача (див. `AuthContext.logout`).
 */
import { getSyncEngineWriter, BENIGN_REJECT_REASONS } from "./singleton";
import { isSyncableUserId } from "./syncableUserId";
import { logger } from "@shared/lib";

/**
 * Скільки чекаємо на доставку черги (усі раунди разом), перш ніж здатися і
 * віддати рішення користувачеві.
 *
 * 5 секунд — компроміс: на живій мережі пуш проходить за сотні
 * мілісекунд, тож людина нічого не помічає; довше тримати вихід
 * заблокованим гірше, ніж показати діалог. При мертвій мережі офлайн-гард
 * у `syncV2.pushLoop` поверне порожній результат майже миттєво, і ми
 * навіть не дочекаємось цього таймауту.
 */
export const LOGOUT_FLUSH_TIMEOUT_MS = 5_000;

/**
 * Мінімальний бюджет на ПІДСУМКОВИЙ підрахунок після дренажу, незалежний від
 * дедлайну. Повільний пуш легко з'їдає весь `LOGOUT_FLUSH_TIMEOUT_MS`, і тоді
 * `remaining() ≈ 0`: підрахунок (на воркерному бекенді це `postMessage`-roundtrip,
 * тобто макротаск) програє `setTimeout(0)` і повертав би `null` саме в
 * сценарії, заради якого діалог і існує (аудит `data-19`, повторна перевірка).
 * Читання локальної БД дешеве, тож секунда понад дедлайн нічого не коштує.
 */
const FINAL_COUNT_MIN_BUDGET_MS = 1_000;

/** Запобіжник від нескінченного циклу, якщо лічильник «прогресує» вічно. */
const MAX_FLUSH_ROUNDS = 50;

export interface FlushBeforeLogoutResult {
  /**
   * Скільки записів лишилось недоставленими (pending + dead_letter +
   * не-benign rejected поточного користувача). `0` — можна безпечно
   * стирати локальну БД.
   */
  readonly pending: number;
  /**
   * `true`, якщо не вдалося прочитати чергу або перевірка впала. Тоді
   * `pending` недостовірний і трактується як `0` (fail-open): краще
   * випустити людину з акаунта, ніж заблокувати вихід через зламану
   * телеметрію.
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
 * Порядок навмисний: спершу дешевий лічильник, і лише якщо справді є що
 * відправляти — дорогий дренаж. Переважна більшість виходів відбувається з
 * порожньою чергою, і вони не мають платити ні мережевим запитом, ні
 * затримкою.
 */
export async function flushPendingSyncOpsBeforeLogout(
  timeoutMs: number = LOGOUT_FLUSH_TIMEOUT_MS,
): Promise<FlushBeforeLogoutResult> {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(0, deadline - Date.now());

  try {
    // Динамічно: sqlite-wasm і db-schema не мають їхати в eager-чанк auth
    // (див. `sqlite.lazy.test.ts`).
    const [sqliteMod, dbSchema] = await Promise.all([
      import("../db/sqlite"),
      import("@sergeant/db-schema/sqlite"),
    ]);
    const userId = sqliteMod.readActiveSqliteUserId();
    // Анонімна/демо-партиція не має черги, яку варто доставляти.
    if (userId === null || !isSyncableUserId(userId)) return SAFE;

    const countUnsynced = async (): Promise<number> => {
      const client = (await sqliteMod.getSqliteDb()).migrationClient();
      return dbSchema.countUnsyncedOutboxForUser(client, {
        userId,
        excludeRejectReasons: [...BENIGN_REJECT_REASONS],
      });
    };

    let left = await withTimeout(countUnsynced(), remaining());
    if (left === null) return { pending: 0, unknown: true };
    if (left === 0) return SAFE;

    // Рушія немає (бут упав, вимкнений синк) — доставити нічим, але черга
    // реально є і зникне разом із файлом. Звітуємо як є, а не «безпечно».
    const runtime = getSyncEngineWriter();
    if (!runtime) return { pending: left, unknown: false };

    logger.info(`[auth.logout] flushing ${left} unsynced op(s) before wipe`);

    // Бекоф: рядки з `next_retry_at` у майбутньому `drain` пропускає, хоча
    // людина вже на мережі й кожна секунда на вагу. Dead-letter оживляємо
    // для однієї додаткової спроби: інакше вони не доставляються зовсім.
    const client = (await sqliteMod.getSqliteDb()).migrationClient();
    await withTimeout(
      dbSchema.resetOutboxBackoffForUser(client, userId),
      remaining(),
    );
    await withTimeout(runtime.recoverAllDeadLetters(), remaining());

    for (let round = 0; round < MAX_FLUSH_ROUNDS && remaining() > 0; round++) {
      await withTimeout(runtime.flushNow(), remaining());
      // Перечитуємо стан замість того, щоб довіряти результату пуша:
      // `flushNow` звітує про ОДИН батч (ліміт 100), а паралельний запис
      // міг додати рядок уже після старту.
      const after = await withTimeout(
        countUnsynced(),
        Math.max(remaining(), FINAL_COUNT_MIN_BUDGET_MS),
      );
      // Перерахунок не вклався навіть у мінімальний бюджет, але ми ВЖЕ знаємо,
      // що `left > 0` і доставку ніщо не підтвердило. Консервативно віддаємо
      // останнє відоме число (діалог покажеться), а не `unknown` (діалогу
      // немає, і logout мовчки стирає чергу).
      if (after === null) return { pending: left, unknown: false };
      if (after === 0) return SAFE;
      const progressed = after < left;
      left = after;
      // Лічильник не зменшився — решта в бекофі/відхиляється; ще раунд
      // лише спалить бюджет часу.
      if (!progressed) break;
    }
    return { pending: left, unknown: false };
  } catch (err) {
    // Fail-open: збій цієї перевірки не має ставати причиною, через яку
    // людина не може вийти з акаунта.
    logger.warn("[auth.logout] pre-wipe sync flush failed", err);
    return { pending: 0, unknown: true };
  }
}
