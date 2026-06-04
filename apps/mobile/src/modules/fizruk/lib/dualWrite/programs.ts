import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type {
  FizrukPlanTemplateSnapshot,
  FizrukProgramsSnapshot,
} from "./diff";

// -----------------------------------------------------------------------
// Stage 12.5 / PR #070f2-mobile-dualwrite — programs singleton row
// -----------------------------------------------------------------------

export async function setPrograms(
  client: SqliteMigrationClient,
  programs: FizrukProgramsSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_programs (user_id, active_program_id, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       active_program_id = excluded.active_program_id,
       updated_at        = excluded.updated_at
     WHERE excluded.updated_at > fizruk_programs.updated_at`,
    [userId, programs.activeProgramId ?? null, clientTs],
  );
}

// -----------------------------------------------------------------------
// Stage 12.5 / PR #070f2-mobile-dualwrite — plan-template singleton row
// -----------------------------------------------------------------------

export async function setPlanTemplate(
  client: SqliteMigrationClient,
  planTemplate: FizrukPlanTemplateSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_plan_templates (user_id, data_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       data_json  = excluded.data_json,
       updated_at = excluded.updated_at
     WHERE excluded.updated_at > fizruk_plan_templates.updated_at`,
    [userId, planTemplate.dataJson ?? "null", clientTs],
  );
}
