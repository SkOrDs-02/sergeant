#!/usr/bin/env node
/**
 * Standalone database migration runner.
 *
 * Історія. Раніше `ensureSchema()` викликався з `server/index.js` при кожному
 * старті web-процесу. На rolling deploy з двома і більше реплік це давало:
 *   - race при `INSERT schema_migrations` (один інстанс програє й упаде),
 *   - або напіврозкочану міграцію, якщо вона довга і другий інстанс приходить
 *     під час виконання,
 *   - затримку readiness-проба пропорційну часу міграції.
 *
 * Правильна модель — Release-stage: цей скрипт запускається окремим job-ом
 * (на Coolify — `pre_deployment_command`, ADR-0074; локально — вручну), перед тим як нові
 * інстанси server-а почнуть приймати трафік. Web-процес на старті більше
 * НЕ виконує міграції.
 *
 * Вибір URL-а:
 *   `MIGRATE_DATABASE_URL` (якщо виставлений) має пріоритет над `DATABASE_URL`.
 *   Сенс: pre-deploy контейнер може не бути в runtime-мережі (так було на
 *   Railway з internal DNS; на Coolify `pre_deployment_command` теж виконується
 *   до того, як новий контейнер стане healthy), тому runtime-значення
 *   `DATABASE_URL` там не завжди придатне. `MIGRATE_DATABASE_URL` задається у
 *   Coolify env і вказує на доступний з pre-deploy URL Postgres, а web-процес
 *   продовжує ходити в БД через `DATABASE_URL`. На docker-compose, CI/local —
 *   достатньо одного `DATABASE_URL`.
 *
 * Вихідні коди: 0 — все ок, 1 — будь-яка помилка (URL відсутній, міграція
 * впала, pg недоступний тощо).
 */

// Нормалізація URL-ів ДО того, як імпортується `server/db.js`: pg-pool
// створюється на етапі eval модуля з `process.env.DATABASE_URL`, тому
// override має відпрацювати раніше за імпорт.
const migrateUrl = process.env.MIGRATE_DATABASE_URL;
if (migrateUrl) {
  process.env.DATABASE_URL = migrateUrl;
}

// AI-DANGER: три налаштування нижче виставляються ДО імпорту `db.ts` і
// кожне закриває окремий спосіб мовчки заклинити деплой. Не «оптимізуй»
// їх назад до runtime-значень — runtime і release-stage тут мають
// протилежні потреби.
//
// 1. `DATABASE_URL_POOL` мусить зникнути. Рядком вище ми перевизначили
//    `DATABASE_URL`, але `db.ts` бере
//    `env.DATABASE_URL_POOL || env.DATABASE_URL` — тобто варто зʼявитись
//    pgBouncer-URL-у, і `MIGRATE_DATABASE_URL` мовчки скасовується, а
//    міграції їдуть через пулер у transaction-mode. Там
//    `pg_advisory_lock` не тримається між запитами, отже захист від двох
//    одночасних деплоїв зникає рівно тоді, коли він потрібен найбільше.
//    Coolify роздає один набір env і pre-deploy-контейнеру, і рантайму,
//    тож розраховувати на «там його не буде» не можна.
//    Раннбук `docs/start/instructions/database-connection-pooling.md`
//    обіцяє саме таку поведінку — цей рядок робить обіцянку правдою.
//
// 2. `statement_timeout` мусить зникнути. `migrate.mjs` імпортує той
//    самий пул, що обслуговує запити, а той створюється з
//    `statement_timeout = PG_STATEMENT_TIMEOUT_MS` (дефолт 30 с). Тобто
//    перша ж міграція, довша за 30 секунд — CREATE INDEX на вирослій
//    таблиці, backfill, ALTER COLUMN TYPE — обривається з 57014,
//    відкочується, і деплой падає. Ретрай дає той самий результат.
//    Перевірено: міграція з `pg_sleep(35)` падає рівно на 30-й секунді з
//    «canceling statement due to statement timeout». Для release-stage
//    правильна стеля — відсутня: краще довга міграція, ніж напівстан.
//
// 3. `lock_timeout` навпаки — мусить зʼявитись. Без нього ALTER TABLE,
//    що став у чергу за довгим читачем, блокує КОЖЕН наступний запит до
//    тієї таблиці на весь час очікування. Краще швидко впасти й
//    повторити деплой, ніж покласти прод чергою блокувань.
process.env.PG_STATEMENT_TIMEOUT_MS = "0";
process.env.PG_LOCK_TIMEOUT_MS = process.env.PG_LOCK_TIMEOUT_MS ?? "10000";
delete process.env.DATABASE_URL_POOL;

if (!process.env.DATABASE_URL) {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "migrate_database_url_missing",
      hint: "Set MIGRATE_DATABASE_URL (Coolify pre_deployment_command; Postgres URL reachable from the pre-deploy container) or DATABASE_URL.",
    }),
  );
  process.exit(1);
}

const { ensureSchema, pool } = await import("./src/db.ts");

async function main() {
  const startedAt = Date.now();
  try {
    await ensureSchema();
    console.log(
      JSON.stringify({
        level: "info",
        msg: "migrate_ok",
        durationMs: Date.now() - startedAt,
        source: migrateUrl ? "MIGRATE_DATABASE_URL" : "DATABASE_URL",
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "migrate_failed",
        durationMs: Date.now() - startedAt,
        source: migrateUrl ? "MIGRATE_DATABASE_URL" : "DATABASE_URL",
        err: {
          message: err?.message || String(err),
          code: err?.code,
        },
      }),
    );
    process.exitCode = 1;
  } finally {
    // `pool.end()` обовʼязковий: без нього процес Node триматиме pg-зʼєднання
    // відкритим і не вийде, а release-job зависне по timeout-у.
    try {
      await pool.end();
    } catch {
      /* best-effort */
    }
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "migrate_unhandled",
      err: { message: err?.message || String(err) },
    }),
  );
  process.exit(1);
});
