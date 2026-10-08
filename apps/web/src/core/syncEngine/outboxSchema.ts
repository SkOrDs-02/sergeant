/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Єдиний мігратор схеми `sync_op_outbox` (вона живе в
 * `ROUTINE_CLIENT_MIGRATIONS`) для ВСІХ, хто її торкається: буту Рутини
 * (`migrateRoutine`), підготовки writer-runtime (`singleton.ts`) і кожного
 * запису в чергу (`enqueueOutboxUpsert`).
 *
 * AI-DANGER: інстанс мусить бути ОДИН. `createClientMigrator` серіалізує
 * виклики лише в межах власного хвоста, тож два окремі мігратори тих самих
 * файлів знову гоняться між собою (`SQLITE_CONSTRAINT_UNIQUE` у журналі).
 *
 * Живий прогін 2026-10-08: на свіжій партиції (реєстрація без анонімних
 * даних) перший запис Фініку потрапляв у чергу ПОСЕРЕД цих міграцій — таблиця
 * вже була, а колонки `user_id` (міграція 006) ще ні. `INSERT` падав на
 * `no such column: user_id`, адаптер ковтав помилку, і запис не їхав на
 * сервер до наступного буту (його доганяв лише реплей журналу dual-write).
 */
import {
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite/migrations";
import {
  createClientMigrator,
  type SqliteMigrationClient,
} from "@shared/lib/db/clientMigrator";

export const migrateOutboxSchema = createClientMigrator(
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
);

/**
 * Клієнти, на яких схему вже доведено до кінця. `migrationClient()` стабільний
 * у межах хендла партиції, тож це кеш «на партицію»: після першого запису
 * наступні не платять навіть SELECT-ом журналу.
 */
const ready = new WeakSet<SqliteMigrationClient>();

/** Чекає, доки `sync_op_outbox` на цьому клієнті має остаточну форму. */
export async function ensureOutboxSchema(
  client: SqliteMigrationClient,
): Promise<void> {
  if (ready.has(client)) return;
  await migrateOutboxSchema(client);
  ready.add(client);
}
