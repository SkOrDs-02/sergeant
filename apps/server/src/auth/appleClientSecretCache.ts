import { logger } from "../obs/logger.js";

// Re-sign 24 hours before Apple's 180-day hard ceiling. The 23h window means
// a Railway deploy that runs indefinitely will always serve a token with at
// least 24h of remaining validity, and ops sees any signing failure a full
// day before it would cause user-visible breakage.
export const APPLE_SECRET_REFRESH_INTERVAL_MS = 23 * 60 * 60 * 1000;

/**
 * Starts a background interval that periodically calls `generateSecret`,
 * then propagates the fresh JWT via `onNewJwt` so the caller can update the
 * provider config object that Better Auth reads at each OAuth token exchange.
 *
 * The interval is unref'd so a quiescent process (e.g. in tests) can still
 * exit cleanly. Returns a cleanup thunk — call it on graceful shutdown or in
 * tests to clear the handle.
 */
export function startAppleSecretRefresher(
  generateSecret: () => Promise<string>,
  onNewJwt: (jwt: string) => void,
): () => void {
  const handle = setInterval(() => {
    generateSecret()
      .then((jwt) => {
        onNewJwt(jwt);
        logger.info(
          { event: "auth.apple.client_secret.refreshed" },
          "Apple client_secret JWT re-signed",
        );
      })
      .catch((err: unknown) => {
        logger.error(
          {
            event: "auth.apple.client_secret.refresh_failed",
            err: err instanceof Error ? err.message : String(err),
          },
          "Apple client_secret refresh failed — continuing with existing token",
        );
      });
  }, APPLE_SECRET_REFRESH_INTERVAL_MS);

  // Don't prevent the process from exiting while only this interval is pending.
  handle.unref();

  return () => clearInterval(handle);
}
