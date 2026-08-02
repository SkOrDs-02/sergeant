/**
 * Local writes for injury marks — the client-authored half of the "не можна"
 * model (ADR-0083).
 *
 * AI-CONTEXT: marks bypass the Fizruk dual-write diff pipeline on purpose.
 * That pipeline diffs whole-state snapshots, which fits entities the UI edits
 * as a tree (workouts and their items/sets). A mark is a single flat row the
 * user creates or clears outright, so it writes straight to SQLite and
 * enqueues its own outbox row — the same contract the pull path already
 * expects (`applyPullOp` lists `fizruk_injuries`) and the server applies in
 * `apps/server/src/modules/sync/fizruk/applyInjuries.ts`.
 *
 * Row keys handed to the outbox MUST match local SQLite column names so the
 * generic pull-apply on other devices needs no mapper.
 */
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { InjuryMark } from "@sergeant/fizruk-domain";

import { fireSyncOutboxUpsert } from "../../../core/syncEngine/fireSyncOutboxUpsert.js";

/**
 * Mark one or more sites as injured. Sites already carrying an open mark are
 * skipped rather than duplicated — clearing is per-mark, so a second row for
 * the same site would leave a mark the user cannot see or remove.
 */
export async function markInjurySites(
  client: SqliteMigrationClient,
  userId: string,
  sites: Iterable<string>,
  nowIso: string,
): Promise<InjuryMark[]> {
  const open = await client.all<{ site: string }>(
    `SELECT site FROM fizruk_injuries
      WHERE user_id = ? AND cleared_at IS NULL AND deleted_at IS NULL`,
    [userId],
  );
  const alreadyOpen = new Set(open.map((row) => row.site));

  const created: InjuryMark[] = [];
  for (const site of sites) {
    if (alreadyOpen.has(site)) continue;
    alreadyOpen.add(site);

    const id = crypto.randomUUID();
    await client.run(
      `INSERT INTO fizruk_injuries
         (id, user_id, site, started_at, cleared_at, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, '', ?, ?)`,
      [id, userId, site, nowIso, nowIso, nowIso],
    );
    fireSyncOutboxUpsert(client, {
      userId,
      table: "fizruk_injuries",
      op: "insert",
      clientTs: nowIso,
      row: {
        id,
        user_id: userId,
        site,
        started_at: nowIso,
        cleared_at: null,
        note: "",
        created_at: nowIso,
        updated_at: nowIso,
      },
    });
    created.push({
      id,
      site,
      startedAt: nowIso,
      clearedAt: null,
      note: "",
      deletedAt: null,
    });
  }
  return created;
}

/**
 * Clear an open mark. Sets `cleared_at` instead of deleting so the original
 * observation survives — a site injured twice keeps both episodes.
 */
export async function clearInjuryMark(
  client: SqliteMigrationClient,
  userId: string,
  injuryId: string,
  nowIso: string,
): Promise<boolean> {
  const rows = await client.all<{ id: string }>(
    `SELECT id FROM fizruk_injuries
      WHERE id = ? AND user_id = ? AND cleared_at IS NULL AND deleted_at IS NULL`,
    [injuryId, userId],
  );
  if (rows.length === 0) return false;

  await client.run(
    `UPDATE fizruk_injuries
        SET cleared_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
    [nowIso, nowIso, injuryId, userId],
  );
  fireSyncOutboxUpsert(client, {
    userId,
    table: "fizruk_injuries",
    op: "update",
    clientTs: nowIso,
    row: {
      id: injuryId,
      user_id: userId,
      cleared_at: nowIso,
      updated_at: nowIso,
    },
  });
  return true;
}
