import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import type { AppliedStatus } from "../syncV2-types.js";
import {
  assertRowUserId,
  guardUuidPkApply,
  queryOne,
  type ExistingUuidRow,
  parseOptionalDate,
  parseRequiredDate,
} from "../applySync-helpers.js";

/**
 * Apply a `fizruk_injuries` sync op — the "не можна" model's storage
 * (ADR-0083, migration `097_fizruk_injuries.sql`).
 *
 * AI-CONTEXT: `site` is NOT validated against a server-side enum. The
 * canonical keyspace lives in `packages/fizruk-domain/src/data/injurySites.ts`
 * and grows as zones are added; pinning it here would make every vocabulary
 * addition a server deploy. An unknown site is dropped client-side by
 * `activeInjurySites`, so it degrades to "blocks nothing" rather than to an
 * error — the safe direction for a value the server cannot interpret.
 *
 * AI-DANGER: `id` is a client-minted TEXT key (`inj_<uuid>`), never a bare
 * uuid. Do not "tidy" the column type — a uuid column rejects every push with
 * 22P02 before apply logic runs, and the failure only surfaces in the client's
 * `sync_op_outbox`, which nothing reads. That is exactly how routine and the
 * pantry ended up with zero server rows until migrations 094/095.
 */
export async function applyFizrukInjuries(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const existing = await queryOne<ExistingUuidRow>(
    client,
    `SELECT user_id, updated_at, deleted_at FROM fizruk_injuries WHERE id = $1`,
    [id],
  );
  const guard = guardUuidPkApply(existing, userId, clientTs);
  if (guard) return guard;

  if (op.op === "delete") {
    if (!existing) return { status: "rejected", reason: "not_found" };
    await client.query(
      `UPDATE fizruk_injuries
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const site = typeof row["site"] === "string" ? row["site"].trim() : "";
  if (!site) return { status: "rejected", reason: "missing_site" };

  const startedAt = parseRequiredDate(row["started_at"]);
  if (startedAt === "invalid") {
    return { status: "rejected", reason: "invalid_started_at" };
  }
  // NULL is meaningful here: it is what makes the mark ACTIVE. Never coerce a
  // missing value to `clientTs` — that would silently clear the injury.
  const clearedAt = parseOptionalDate(row["cleared_at"]);
  if (clearedAt === "invalid") {
    return { status: "rejected", reason: "invalid_cleared_at" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }
  const note = typeof row["note"] === "string" ? row["note"] : "";

  if (!existing) {
    await client.query(
      `INSERT INTO fizruk_injuries
         (id, user_id, site, started_at, cleared_at, note,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        userId,
        site,
        startedAt,
        clearedAt ?? null,
        note,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE fizruk_injuries
         SET site = $1, started_at = $2, cleared_at = $3, note = $4,
             updated_at = $5, deleted_at = $6
       WHERE id = $7 AND user_id = $8`,
      [
        site,
        startedAt,
        clearedAt ?? null,
        note,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}
