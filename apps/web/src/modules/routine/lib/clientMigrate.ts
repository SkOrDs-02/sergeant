import type { SqliteMigrationClient } from "@shared/lib/db/clientMigrator";

import { migrateOutboxSchema } from "../../../core/syncEngine/outboxSchema";

/**
 * Run the routine SQLite client migrations. Idempotent via the runner's
 * `__migrations` ledger contract (see
 * `packages/db-schema/src/migrate/runner.ts`).
 *
 * `ROUTINE_MIGRATIONS_TABLE` keeps the existing migration table
 * name.
 *
 * Це ТОЙ САМИЙ інстанс, що й `migrateOutboxSchema`: у цих файлах живе
 * `sync_op_outbox`, тож бут Рутини, writer-runtime і запис у чергу мусять
 * стояти в одній черзі мігратора (див. `core/syncEngine/outboxSchema.ts`).
 */
export const migrateRoutine = migrateOutboxSchema;

export type { SqliteMigrationClient };
