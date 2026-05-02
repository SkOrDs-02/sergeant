/**
 * Idempotency-key generator for the SPIKE.
 *
 * `/api/v2/sync/push` enforces UNIQUE per (user_id, idempotency_key)
 * against the server's `sync_op_log` and replays return cached results
 * without re-applying. Clients must never re-use a key for a different
 * op — see Hard Rule contract in
 * `apps/server/src/migrations/027_sync_op_log.sql`.
 *
 * Keys must match the server-side regex `/^[A-Za-z0-9_-]+$/` (`SyncV2OpSchema`
 * in `packages/shared/src/schemas/api.ts`); plain UUIDs always do, so we
 * piggy-back on `crypto.randomUUID()` and only fall back to a manual
 * generator for very old environments where it's missing.
 */
export function newIdempotencyKey(): string {
  const cryptoApi: { randomUUID?: () => string } | undefined =
    typeof globalThis !== "undefined"
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  // Defensive fallback. Generates a 22-char base64-url-ish token. The
  // SPIKE is unlikely to ever hit this branch (Vite targets evergreen
  // browsers + jsdom both expose `crypto.randomUUID`), but the fallback
  // exists so a random old runtime doesn't crash when feature flag is
  // flipped on.
  let token = "";
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  for (let i = 0; i < 22; i++) {
    token += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return token;
}
