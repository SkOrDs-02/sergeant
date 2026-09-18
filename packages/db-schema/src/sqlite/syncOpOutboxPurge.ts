import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";

/**
 * Logout-time purge of the client-side `sync_op_outbox`
 * (HIGH-#2 of the T3 audit —
 * https://app.devin.ai/sessions/8574143f172540b7be52c314facfc0c5).
 *
 * The drain helper already filters by `user_id`, so the previous
 * user's queued ops cannot be pushed under a new user's session
 * cookie at the engine level. This helper closes the second leg of
 * that defence: when the user explicitly signs out, every pending
 * row owned by them is removed from the local outbox immediately,
 * so the queue does not silently accumulate orphan rows that the
 * next sign-in (even of the same user, on a different cookie / TTL
 * window) might inadvertently flush under unrelated circumstances.
 *
 * Scope:
 *
 *  - Deletes rows whose `user_id` matches the argument and whose
 *    `status='pending'`. Terminal rows (`'rejected'`, `'dead_letter'`)
 *    are intentionally kept — they carry forensic value for the dev
 *    panel and never re-push.
 *  - Empty `userId` is rejected so callers cannot accidentally wipe
 *    the entire outbox by passing in a falsy / unauthenticated value
 *    (`localStorage.getItem('sync_owner_id')` returning `null`,
 *    Better Auth session expiring mid-call, etc.).
 *  - The helper is a single SQL statement; the caller is expected
 *    to invoke it inside its own transaction if it batches more
 *    logout work (Better Auth cookie clear, MMKV erase, etc.).
 */
export async function purgeSyncOpOutboxForUser(
  client: SqliteMigrationClient,
  userId: string,
): Promise<void> {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error(
      `purgeSyncOpOutboxForUser: userId is required — refusing to ` +
        `wipe the outbox for an unauthenticated caller.`,
    );
  }
  await client.run(
    `DELETE FROM sync_op_outbox
      WHERE user_id = ?
        AND status = 'pending'`,
    [userId],
  );
}
