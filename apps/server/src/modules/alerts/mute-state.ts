/**
 * `openclaw_mute_state` — founder DM "do not disturb" пауза (read-guard).
 *
 * Pure helper навколо `pg.Pool` (DI-friendly + тестується). Жодного
 * caching, жодних singletons. Alerts shipper викликає `isFounderMuted`
 * перед send-ом у founder-DM канал (WF-103 escalations, SAB direct-to-
 * founder pings); severity=P0 bypass робить сам caller.
 *
 * Таблиця `openclaw_mute_state` (міграція 066) лишається історичною —
 * назву не міняємо, бо міграції immutable (Hard Rule #4). Guard повертає
 * raw state; critical-override НЕ живе тут.
 */

import type { Pool } from "pg";

export interface MuteCheckResult {
  muted: boolean;
  mutedUntilIso: string | null;
  reason: string | null;
}

/**
 * Runtime guard для outbound founder-DM channels (alerts shipper).
 * Returns `muted=true` тільки якщо `muted_until > NOW()`. Expired mute →
 * `false` (silent), row не DELETE-аємо.
 *
 * Caller responsibility: severity=P0 (critical) bypass — НЕ робиться тут,
 * бо guard generic.
 */
export async function isFounderMuted(
  pool: Pool,
  input: { founderUserId: string },
): Promise<MuteCheckResult> {
  const result = await pool.query<{
    muted_until: Date | null;
    reason: string | null;
  }>(
    `SELECT muted_until, reason
       FROM openclaw_mute_state
      WHERE founder_user_id = $1
        AND muted_until IS NOT NULL
        AND muted_until > NOW()`,
    [input.founderUserId],
  );
  const row = result.rows[0];
  if (!row || !row.muted_until) {
    return { muted: false, mutedUntilIso: null, reason: null };
  }
  return {
    muted: true,
    mutedUntilIso: row.muted_until.toISOString(),
    reason: row.reason,
  };
}
