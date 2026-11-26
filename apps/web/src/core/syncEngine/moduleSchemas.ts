import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

/**
 * Схеми чотирьох модулів у SQLite-партиції, з якою працює читач синку.
 *
 * AI-CONTEXT: читач застосовує оп-и в таблиці модулів, але сам їх не створює:
 * таблиці матеріалізують ліниві boot-кластери модулів. Поки вони не дійшли до
 * свіжої партиції (вихід і повторний вхід на тому ж пристрої, відновлення
 * акаунта, перший запуск), `pragma_table_info` повертав порожньо, оп
 * відхилявся як термінальний, а курсор ішов далі: рядок на цьому пристрої
 * губився назавжди, хоча сервер його тримав (`FULL-20261125-DATA-1`,
 * `FULL-20261125-DATA-2`). Тому читач доводить схему сам, до першого pull.
 *
 * Мігратори ідемпотентні й серіалізовані (`createClientMigrator`), тож
 * паралельний прогін із boot-кластером безпечний. Мемо на клієнта: нова
 * партиція = новий клієнт = новий прогін; збій мемо не лишає, наступний тік
 * спробує знову.
 */
const ready = new WeakMap<SqliteMigrationClient, Promise<void>>();

async function migrateModuleSchemas(
  client: SqliteMigrationClient,
): Promise<void> {
  const [
    { migrateRoutine },
    { migrateFizruk },
    { migrateNutrition },
    { migrateFinyk },
  ] = await Promise.all([
    import("../../modules/routine/lib/clientMigrate.js"),
    import("../../modules/fizruk/lib/clientMigrate.js"),
    import("../../modules/nutrition/lib/clientMigrate.js"),
    import("../../modules/finyk/lib/clientMigrate.js"),
  ]);
  await migrateRoutine(client);
  await migrateFizruk(client);
  await migrateNutrition(client);
  await migrateFinyk(client);
}

export function ensureModuleSchemas(
  client: SqliteMigrationClient,
  migrate: (
    client: SqliteMigrationClient,
  ) => Promise<void> = migrateModuleSchemas,
): Promise<void> {
  const known = ready.get(client);
  if (known) return known;
  const run = migrate(client);
  ready.set(client, run);
  run.catch(() => {
    if (ready.get(client) === run) ready.delete(client);
  });
  return run;
}
