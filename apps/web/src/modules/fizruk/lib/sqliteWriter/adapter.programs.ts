/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * Dual-write активної тренувальної програми (`fizruk_programs`, singleton
 * `user_id -> active_program_id`). Дзеркало мобільного
 * `apps/mobile/.../sqliteWriter/programs.ts`, щоб обидва клієнти писали той
 * самий рядок і серверний `applyFizrukPrograms` бачив однакову форму.
 *
 * Винесено з `adapter.ts` заради module-size (Hard Rule #18), як і
 * `adapter.customActivities.ts`.
 */

import {
  buildLwwUpsert,
  type DualWriteRuntime,
  type TableSpec,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";
import type { FizrukProgramsSnapshot } from "./diff/index.js";

const PROGRAMS_UPSERT_SPEC: TableSpec = {
  table: "fizruk_programs",
  insertClause: `INSERT INTO fizruk_programs (user_id, active_program_id, updated_at)
     VALUES (?, ?, ?)`,
  conflictTarget: ["user_id"],
  updateColumns: [{ column: "active_program_id" }, { column: "updated_at" }],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

export const PROGRAMS_UPSERT_SQL = buildLwwUpsert(PROGRAMS_UPSERT_SPEC);

/**
 * Пише singleton-рядок локально і кладе op у `sync_op_outbox`.
 *
 * Помилка outbox-а НЕ ковтається (на відміну від `.catch(() => {})` у
 * `adapter.customActivities.ts`): викликач-дрен LS-ключа видаляє джерело лише
 * після успіху, інакше вибір програми міг би зникнути без сліду. Обгортка
 * `createApplyOps` у адаптері й так ловить виняток на рівні op-а.
 */
export async function setPrograms(
  client: SqliteMigrationClient,
  programs: FizrukProgramsSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const activeProgramId = programs.activeProgramId ?? null;
  await client.run(PROGRAMS_UPSERT_SQL, [userId, activeProgramId, clientTs]);
  await enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_programs",
    op: "insert",
    row: { user_id: userId, active_program_id: activeProgramId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  });
}
