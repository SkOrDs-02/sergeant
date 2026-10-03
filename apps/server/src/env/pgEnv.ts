import {
  boolFromEnv,
  coerceInt,
  intFromEnv,
  optionalUrl,
} from "./envHelpers.js";

/**
 * Postgres-звʼязані env-поля — винесені з `env.ts` тим самим прийомом і з
 * тієї ж причини, що `telegramEnv.ts`: Hard Rule #18 (`max-lines: 600`,
 * `skipBlankLines` + `skipComments`). Файл перетнув межу після злиття
 * аудиту бекенду з `main`, де обидві гілки дописали свій блок перевірок.
 *
 * Zero behaviour change: spread у shape `envSchema` в `env.ts`
 * (`...pgEnvShape`), тож `env.PG_*` і `env.DATABASE_URL*` резолвляться
 * точно як раніше — жоден зовнішній імпорт не змінюється.
 *
 * Група цілісна не лише формально: усі ці ключі читає один і той самий
 * `db.ts` при створенні пулу, і три таймаути нижче мають сенс лише разом.
 */
export const pgEnvShape = {
  DATABASE_URL: optionalUrl(),

  DATABASE_URL_POOL: optionalUrl(),

  DATABASE_URL_REPLICA: optionalUrl(),

  PG_POOL_SIZE: intFromEnv(20),

  PG_CONNECTION_TIMEOUT_MS: intFromEnv(5_000),

  PG_SLOW_CONNECT_MS: intFromEnv(500),

  PG_IDLE_TIMEOUT_MS: intFromEnv(30_000),

  PG_STATEMENT_TIMEOUT_MS: intFromEnv(30_000),

  /**
   * Скільки запит чекає на БЛОКУВАННЯ, перш ніж здатись. Окремо від
   * `statement_timeout`, бо це різні відмови: той рахує час ВИКОНАННЯ,
   * цей — час стояння в черзі за локом. Без нього `ALTER TABLE`, що
   * став за довгим читачем, тримає чергу і блокує КОЖЕН наступний
   * запит до тієї таблиці — класичний спосіб покласти прод міграцією,
   * яка сама по собі миттєва.
   *
   * `0` — вимкнено (поведінка Postgres за замовчуванням).
   * `migrate.mjs` піднімає це значення для release-stage окремо.
   */
  PG_LOCK_TIMEOUT_MS: intFromEnv(10_000),

  /**
   * Стеля на транзакцію, яка відкрилась і заснула. Без неї завислий
   * `BEGIN` тримає і зʼєднання з пулу, і взяті блокування безстроково —
   * тобто один застряглий запит поступово зʼїдає пул, а `VACUUM` не
   * може прибрати мертві рядки.
   */
  PG_IDLE_IN_TRANSACTION_TIMEOUT_MS: intFromEnv(60_000),

  DB_MAX_RETRIES: intFromEnv(3),

  DB_SLOW_MS: coerceInt.positive().default(200),

  SLOW_QUERY_THRESHOLD_MS: intFromEnv(100),

  LOG_SLOW_QUERIES: boolFromEnv(true),
};
