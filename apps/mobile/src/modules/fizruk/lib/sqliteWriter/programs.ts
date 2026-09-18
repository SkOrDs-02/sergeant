import {
  buildLwwUpsert,
  type DualWriteRuntime,
  type TableSpec,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { fireSyncOutboxUpsert } from "@/core/syncEngine/fireSyncOutboxUpsert";
import type {
  FizrukPlanTemplateSnapshot,
  FizrukProgramsSnapshot,
} from "./diff";

// -----------------------------------------------------------------------
// Table specs
// -----------------------------------------------------------------------

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

const PLAN_TEMPLATE_UPSERT_SPEC: TableSpec = {
  table: "fizruk_plan_templates",
  insertClause: `INSERT INTO fizruk_plan_templates (user_id, data_json, updated_at)
     VALUES (?, ?, ?)`,
  conflictTarget: ["user_id"],
  updateColumns: [{ column: "data_json" }, { column: "updated_at" }],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const PROGRAMS_UPSERT_SQL = buildLwwUpsert(PROGRAMS_UPSERT_SPEC);
const PLAN_TEMPLATE_UPSERT_SQL = buildLwwUpsert(PLAN_TEMPLATE_UPSERT_SPEC);

// -----------------------------------------------------------------------
// Stage 12.5 / PR #070f2-mobile-dualwrite — programs singleton row
// -----------------------------------------------------------------------

export async function setPrograms(
  client: SqliteMigrationClient,
  programs: FizrukProgramsSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(PROGRAMS_UPSERT_SQL, [
    userId,
    programs.activeProgramId ?? null,
    clientTs,
  ]);
  fireSyncOutboxUpsert(client, {
    userId,
    table: "fizruk_programs",
    op: "insert",
    clientTs,
    row: {
      user_id: userId,
      active_program_id: programs.activeProgramId ?? null,
    },
  });
}

// -----------------------------------------------------------------------
// Stage 12.5 / PR #070f2-mobile-dualwrite — plan-template singleton row
// -----------------------------------------------------------------------

export async function setPlanTemplate(
  client: SqliteMigrationClient,
  planTemplate: FizrukPlanTemplateSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(PLAN_TEMPLATE_UPSERT_SQL, [
    userId,
    planTemplate.dataJson ?? "null",
    clientTs,
  ]);
  fireSyncOutboxUpsert(client, {
    userId,
    table: "fizruk_plan_templates",
    op: "insert",
    clientTs,
    row: { user_id: userId, data_json: planTemplate.dataJson ?? "null" },
  });
}
