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
 * (на Railway це pre-deploy command, на Replit — вручну), перед тим як нові
 * інстанси server-а почнуть приймати трафік. Web-процес на старті більше
 * НЕ виконує міграції.
 *
 * Вибір URL-а:
 *   `MIGRATE_DATABASE_URL` (якщо виставлений) має пріоритет над `DATABASE_URL`.
 *   Сенс: на Railway internal DNS `postgres.railway.internal` не резолвиться
 *   у Pre-Deploy контейнері (він ще не в runtime-мережі), тому runtime-значення
 *   `DATABASE_URL` там непридатне. Виставляєш `MIGRATE_DATABASE_URL` на
 *   публічний proxy-URL Postgres (`${{ Postgres.DATABASE_PUBLIC_URL }}`), а
 *   web-процес продовжує ходити в БД через швидший internal DNS. На Replit,
 *   docker-compose, CI/local — достатньо одного `DATABASE_URL`.
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

if (!process.env.DATABASE_URL) {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "migrate_database_url_missing",
      hint: "Set MIGRATE_DATABASE_URL (preferred for Railway pre-deploy, points to Postgres public URL) or DATABASE_URL.",
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
