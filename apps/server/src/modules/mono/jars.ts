import { query } from "../../db.js";
import { logger } from "../../obs/logger.js";
import { MONO_API_TIMEOUT_MS } from "./connection.js";
import {
  monoKeyRing,
  decryptAndLazyReencrypt,
  type MonoTokenRow,
} from "./tokenStore.js";

/**
 * Shape of one entry in Monobank's `/personal/client-info` `jars[]` array.
 * Docs: https://api.monobank.ua/docs/personal.html
 */
export interface MonoClientInfoJar {
  id: string;
  sendId?: string;
  title?: string;
  description?: string;
  currencyCode?: number;
  balance?: number;
  goal?: number;
}

/**
 * Upsert jars from a client-info response into `mono_jar` (migration 088).
 * Mirrors the `mono_account` upsert loop in `connection.ts` — same
 * `ON CONFLICT (user_id, mono_jar_id) DO UPDATE` shape.
 */
export async function upsertJars(
  userId: string,
  jars: readonly MonoClientInfoJar[],
): Promise<void> {
  for (const jar of jars) {
    await query(
      `INSERT INTO mono_jar
         (user_id, mono_jar_id, send_id, title, description, currency_code,
          balance, goal, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id, mono_jar_id) DO UPDATE SET
         send_id = EXCLUDED.send_id,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         currency_code = EXCLUDED.currency_code,
         balance = EXCLUDED.balance,
         goal = EXCLUDED.goal,
         last_seen_at = NOW()`,
      [
        userId,
        jar.id,
        jar.sendId ?? null,
        jar.title ?? null,
        jar.description ?? null,
        jar.currencyCode ?? 0,
        jar.balance ?? null,
        jar.goal ?? null,
      ],
      { op: "mono_jar_upsert" },
    );
  }
}

/**
 * Best-effort refresh of `mono_jar` from a fresh `/personal/client-info`
 * call, using the user's already-stored (encrypted) Mono token.
 *
 * Called from `GET /api/mono/jars` so jar balances stay fresh "at every
 * regular sync / Фінік open" (spec decision #5 — no separate realtime
 * needed) without a cron or webhook: reads are infrequent (React Query
 * `staleTime` on the web side already throttles this to a few calls/hour
 * per user) and Monobank's client-info endpoint has no documented rate
 * limit tighter than the webhook-register call this module already makes
 * at connect time.
 *
 * Swallows all errors — a Monobank outage must never turn a jars read into
 * a 500; the handler falls back to whatever `mono_jar` already has from the
 * last successful refresh.
 */
export async function refreshJarsFromMono(userId: string): Promise<void> {
  const ring = monoKeyRing();
  if (!ring) return;

  try {
    const connResult = await query<MonoTokenRow>(
      `SELECT token_ciphertext, token_iv, token_tag, token_key_version
       FROM mono_connection WHERE user_id = $1 AND status = 'active'`,
      [userId],
      { op: "mono_jars_refresh_connection_select" },
    );
    const row = connResult.rows[0];
    if (!row) return;

    const token = await decryptAndLazyReencrypt(row, userId, ring);
    const res = await fetch("https://api.monobank.ua/personal/client-info", {
      headers: { "X-Token": token },
      signal: AbortSignal.timeout(MONO_API_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({
        msg: "mono_jars_refresh_upstream_error",
        status: res.status,
      });
      return;
    }

    const clientInfo = (await res.json()) as { jars?: MonoClientInfoJar[] };
    await upsertJars(userId, clientInfo.jars ?? []);
  } catch (err) {
    logger.warn({
      msg: "mono_jars_refresh_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
