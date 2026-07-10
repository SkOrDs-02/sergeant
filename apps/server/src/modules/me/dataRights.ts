import type { Pool, PoolClient } from "pg";
import type {
  MeDeleteResponse,
  MeExportResponse,
  MeResponse,
  UserPreferences,
  UserPreferencesPatch,
} from "@sergeant/shared";

type Queryable = Pick<Pool | PoolClient, "query">;

const DEFAULT_PREFERENCES: Omit<UserPreferences, "updatedAt"> = {
  analytics: true,
  aiMemory: true,
  pushNotifications: false,
};

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function maybeIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function rowArray(
  rows: ReadonlyArray<Record<string, unknown>>,
): Record<string, unknown>[] {
  return rows.map((row) => ({ ...row }));
}

function serializePreferences(
  row: Record<string, unknown> | undefined,
): UserPreferences {
  if (!row) {
    return { ...DEFAULT_PREFERENCES, updatedAt: null };
  }
  return {
    analytics: row["analytics"] === true,
    aiMemory: row["ai_memory"] === true,
    pushNotifications: row["push_notifications"] === true,
    updatedAt: maybeIso(row["updated_at"] as Date | string | null | undefined),
  };
}

export async function getUserPreferences(
  db: Queryable,
  userId: string,
): Promise<UserPreferences> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT analytics, ai_memory, push_notifications, updated_at
       FROM user_preferences
      WHERE user_id = $1`,
    [userId],
  );
  return serializePreferences(result.rows[0]);
}

export async function upsertUserPreferences(
  db: Queryable,
  userId: string,
  patch: UserPreferencesPatch,
): Promise<UserPreferences> {
  const current = await getUserPreferences(db, userId);
  const next = {
    analytics: patch.analytics ?? current.analytics,
    aiMemory: patch.aiMemory ?? current.aiMemory,
    pushNotifications: patch.pushNotifications ?? current.pushNotifications,
  };
  const result = await db.query<Record<string, unknown>>(
    `INSERT INTO user_preferences
        (user_id, analytics, ai_memory, push_notifications, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        analytics = EXCLUDED.analytics,
        ai_memory = EXCLUDED.ai_memory,
        push_notifications = EXCLUDED.push_notifications,
        updated_at = NOW()
      RETURNING analytics, ai_memory, push_notifications, updated_at`,
    [userId, next.analytics, next.aiMemory, next.pushNotifications],
  );
  return serializePreferences(result.rows[0]);
}

export async function buildMeExport(
  db: Queryable,
  user: MeResponse["user"],
): Promise<MeExportResponse> {
  // AI-NOTE: module_data was dropped by migration 046 (Stage 7 cleanup —
  // finyk/fizruk/routine/nutrition moved to per-row tables in Stage 4,
  // coach moved to coach_memory in migration 045). moduleData is kept in
  // the export schema for backward-compat with any client that expects the
  // key; it is always [] since the underlying table no longer exists.
  const [
    preferences,
    monoConnection,
    monoAccounts,
    monoTransactions,
    subscriptions,
    pushSubscriptions,
    pushDevices,
    aiUsageDaily,
    aiMemories,
  ] = await Promise.all([
    getUserPreferences(db, user.id),
    db.query<Record<string, unknown>>(
      `SELECT status, token_fingerprint, webhook_registered_at,
              last_event_at, last_backfill_at, created_at, updated_at
         FROM mono_connection
        WHERE user_id = $1`,
      [user.id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT mono_account_id, send_id, type, currency_code, cashback_type,
              masked_pan, iban, balance, credit_limit, last_seen_at
         FROM mono_account
        WHERE user_id = $1
        ORDER BY mono_account_id`,
      [user.id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT mono_account_id, mono_tx_id, time, amount, operation_amount,
              currency_code, mcc, original_mcc, hold, description, comment,
              cashback_amount, commission_rate, balance, receipt_id, invoice_id,
              counter_edrpou, counter_iban, counter_name, raw, source, received_at
         FROM mono_transaction
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY time DESC
        LIMIT 5000`,
      [user.id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT id, plan, status, provider, current_period_end,
              cancel_at_period_end, created_at, updated_at
         FROM subscriptions
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [user.id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT endpoint, created_at, deleted_at
         FROM push_subscriptions
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [user.id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT platform, endpoint, created_at, updated_at, deleted_at
         FROM push_devices
        WHERE user_id = $1
        ORDER BY updated_at DESC`,
      [user.id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT usage_day, bucket, request_count, est_cost_usd, deleted_at
         FROM ai_usage_daily
        WHERE subject_key = $1
        ORDER BY usage_day DESC`,
      [`u:${user.id}`],
    ),
    db.query<Record<string, unknown>>(
      `SELECT id, source, source_ref, content, metadata, created_at,
              updated_at, deleted_at
         FROM ai_memories
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 5000`,
      [user.id],
    ),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    user,
    preferences,
    data: {
      moduleData: [],
      mono: {
        connection: monoConnection.rows[0]
          ? { ...monoConnection.rows[0] }
          : null,
        accounts: rowArray(monoAccounts.rows),
        transactions: rowArray(monoTransactions.rows),
      },
      billing: {
        subscriptions: rowArray(subscriptions.rows),
      },
      push: {
        webSubscriptions: rowArray(pushSubscriptions.rows),
        devices: rowArray(pushDevices.rows),
      },
      ai: {
        usageDaily: rowArray(aiUsageDaily.rows),
        memories: rowArray(aiMemories.rows),
      },
    },
  };
}

export async function deleteUserData(
  pool: Pool,
  userId: string,
): Promise<MeDeleteResponse> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE subscriptions
          SET status = 'canceled',
              cancel_at_period_end = TRUE,
              updated_at = NOW()
        WHERE user_id = $1
          AND status IN ('active', 'trialing', 'past_due', 'incomplete')`,
      [userId],
    );
    await client.query(
      `UPDATE ai_memories
          SET deleted_at = COALESCE(deleted_at, NOW()),
              updated_at = NOW()
        WHERE user_id = $1`,
      [userId],
    );
    await client.query(
      `DELETE FROM "user"
        WHERE id = $1`,
      [userId],
    );
    await client.query("COMMIT");
    return { ok: true, deletedAt: iso(new Date()) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
