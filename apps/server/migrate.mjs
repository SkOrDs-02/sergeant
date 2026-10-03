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
 * Правильна модель — окремий процес перед стартом веб-сервера. Web-процес на
 * старті міграції НЕ виконує: йому потрібен `statement_timeout`, пулер і
 * швидка readiness, а release-stage — рівно протилежне (див. три налаштування
 * нижче). Спільний процес не може дати обидва набори.
 *
 * Запускається з ENTRYPOINT образу:
 * `sh -c "node dist-server/migrate.js && exec node dist-server/index.js"`
 * (`Dockerfile.api`, форму стереже
 * `scripts/__tests__/dockerfile-api-migrate-entrypoint.test.mjs`). Локально —
 * вручну через `pnpm db:migrate`.
 *
 * Чому НЕ Coolify `pre_deployment_command` (так було до 2026-09-21): Coolify
 * виконує його через `docker exec` у контейнері, що ЩЕ ПРАЦЮЄ на попередньому
 * образі. Цей скрипт тоді читає СТАРІ `.sql`, нової міграції не бачить і
 * чесно рапортує `migrate_ok` — тобто кожна міграція застосовувалась на один
 * деплой пізніше за код, який на неї розраховує (знахідка 2026-08-28). На
 * Railway та сама модель була справною: `preDeployCommand` піднімав свіжий
 * контейнер з нового образу, тож поле перенесли за іменем, а не за поведінкою.
 *
 * Вибір URL-а:
 *   `MIGRATE_DATABASE_URL` (якщо виставлений) має пріоритет над `DATABASE_URL`.
 *   Історично це був спадок Railway, де pre-deploy виконувався ПОЗА runtime-
 *   мережею й потребував публічного URL. Відколи міграції їдуть з ENTRYPOINT
 *   того самого контейнера, обидва URL показують на одну базу, і на Coolify
 *   це буквально одне значення. Змінна лишається як шов: дає розвести
 *   міграційне й рантаймове підключення (окремий користувач з DDL-правами,
 *   інший хост) не чіпаючи код. На docker-compose, CI/local достатньо
 *   одного `DATABASE_URL`.
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
//    Міграції тепер їдуть у тому самому контейнері, що й рантайм, тобто з
//    тим самим набором env — розраховувати на «там його не буде» не можна
//    тим паче.
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
      hint: "Set DATABASE_URL (or MIGRATE_DATABASE_URL to route migrations at a separate Postgres user/host). Container ENTRYPOINT runs this before the web server, so an unset URL stops the boot.",
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
