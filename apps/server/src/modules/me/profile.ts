import type { Pool, PoolClient } from "pg";
import type { UserProfilePayload, UserProfileResponse } from "@sergeant/shared";

type Queryable = Pick<Pool | PoolClient, "query">;

/**
 * `user_profile` (migration 115) write-through wiring — Stage 2/Stage 4 per
 * the migration's own header comment. This is deliberately NOT an
 * oplog-sync module (no LWW-guard, no `sync_op_log` involvement): one row
 * per user, single JSONB `payload`, plain upsert. Mirrors
 * `dataRights.ts::getUserPreferences` / `upsertUserPreferences` in shape
 * ("defaults, not 404" when no row exists yet).
 */

function maybeIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function getUserProfile(
  db: Queryable,
  userId: string,
): Promise<UserProfileResponse> {
  const result = await db.query<{
    payload: unknown;
    updated_at: Date | string | null;
  }>(`SELECT payload, updated_at FROM user_profile WHERE user_id = $1`, [
    userId,
  ]);
  if (result.rows.length === 0) {
    return { profile: {}, updatedAt: null };
  }
  const row = result.rows[0]!;
  return {
    profile: (row.payload ?? {}) as UserProfilePayload,
    updatedAt: maybeIso(row.updated_at),
  };
}

export async function upsertUserProfile(
  db: Queryable,
  userId: string,
  profile: UserProfilePayload,
): Promise<UserProfileResponse> {
  const result = await db.query<{
    payload: unknown;
    updated_at: Date | string | null;
  }>(
    `INSERT INTO user_profile (user_id, payload, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       payload = EXCLUDED.payload,
       updated_at = NOW()
     RETURNING payload, updated_at`,
    [userId, JSON.stringify(profile)],
  );
  const row = result.rows[0]!;
  return {
    profile: (row.payload ?? {}) as UserProfilePayload,
    updatedAt: maybeIso(row.updated_at),
  };
}
