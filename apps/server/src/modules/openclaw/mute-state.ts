/**
 * `openclaw_mute_state` — founder DM "do not disturb" пауза.
 *
 * Pure helpers навколо `pg.Pool` (як `store.ts`): caller приносить свій
 * pool (DI-friendly + тестується). Жодного caching, жодних singletons.
 * Точка інтеграції: `setFounderMute` / `clearFounderMute` / `getFounderMute`
 * (state-mutation) і `isFounderMuted` (read-guard для outbound channels —
 * alerts shipper, briefing endpoint).
 *
 * Critical-override НЕ живе тут — guard повертає raw state, caller сам
 * вирішує bypass (severity=P0). Це дозволяє кожному outbound-channel-у
 * мати свій override-criterion без перевантаженого guard-API.
 */

import type { Pool } from "pg";

/**
 * Кейс «жодного-row» (founder ніколи не муртив) і «muted_until у
 * минулому» поведінкові еквівалентні з точки зору guard-у — обидва
 * "not muted". Запис row-у з `muted_until = NULL` дозволяє відрізнити
 * "/mute off" від "ніколи не муртив" у audit-payload.
 */
export interface MuteState {
  founderUserId: string;
  mutedUntilIso: string | null;
  setAtIso: string;
  reason: string | null;
}

export interface MuteCheckResult {
  muted: boolean;
  mutedUntilIso: string | null;
  reason: string | null;
}

interface MuteStateRow {
  founder_user_id: string;
  muted_until: Date | null;
  set_at: Date;
  reason: string | null;
}

function rowToState(row: MuteStateRow): MuteState {
  return {
    founderUserId: row.founder_user_id,
    mutedUntilIso: row.muted_until ? row.muted_until.toISOString() : null,
    setAtIso: row.set_at.toISOString(),
    reason: row.reason,
  };
}

/**
 * Upsert mute row для founder-а. `mutedUntil = null` означає
 * "explicit unmute via /mute off"; `mutedUntil > NOW()` — активний
 * mute; `mutedUntil <= NOW()` — пройшов сам по собі (treat as
 * unmuted у guard).
 */
export async function setFounderMute(
  pool: Pool,
  input: {
    founderUserId: string;
    mutedUntil: Date | null;
    reason: string | null;
  },
): Promise<MuteState> {
  const result = await pool.query<MuteStateRow>(
    `INSERT INTO openclaw_mute_state (founder_user_id, muted_until, set_at, reason)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (founder_user_id)
     DO UPDATE SET
       muted_until = EXCLUDED.muted_until,
       set_at = EXCLUDED.set_at,
       reason = EXCLUDED.reason
     RETURNING founder_user_id, muted_until, set_at, reason`,
    [input.founderUserId, input.mutedUntil, input.reason],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("setFounderMute: upsert returned no row");
  }
  return rowToState(row);
}

/**
 * "/mute off" — convenience wrapper над `setFounderMute(mutedUntil:
 * null, reason: null)`. Зберігає row для audit-trail (`set_at`
 * bumpається).
 */
export async function clearFounderMute(
  pool: Pool,
  input: { founderUserId: string },
): Promise<MuteState> {
  return setFounderMute(pool, {
    founderUserId: input.founderUserId,
    mutedUntil: null,
    reason: null,
  });
}

/**
 * Read raw mute-state для founder. `null` коли row не існує —
 * `/mute status` UI рендерить «not muted».
 */
export async function getFounderMute(
  pool: Pool,
  input: { founderUserId: string },
): Promise<MuteState | null> {
  const result = await pool.query<MuteStateRow>(
    `SELECT founder_user_id, muted_until, set_at, reason
       FROM openclaw_mute_state
      WHERE founder_user_id = $1`,
    [input.founderUserId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return rowToState(row);
}

/**
 * Runtime guard для outbound channels (alerts shipper, briefing
 * endpoint, ranok-cron). Returns `{muted: boolean, mutedUntilIso}` —
 * muted=true тільки якщо `muted_until > NOW()`. Expired mute → `false`
 * (silent), не DELETE-аємо row.
 *
 * Caller responsibility: severity=P0 (critical) bypass — НЕ робиться
 * тут, бо guard generic. Alerts shipper робить:
 *   ```
 *   const guard = await isFounderMuted(pool, { founderUserId });
 *   if (guard.muted && severity !== 'P0') {
 *     Sentry.addBreadcrumb({ category: 'openclaw.mute', ... });
 *     return { action: 'skipped_muted', mutedUntilIso: guard.mutedUntilIso };
 *   }
 *   // … proceed with send
 *   if (guard.muted && severity === 'P0') {
 *     Sentry.addBreadcrumb({ category: 'openclaw.mute', message: 'override-critical', ... });
 *   }
 *   ```
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
