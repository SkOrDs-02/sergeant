/**
 * In-process pub-sub for `X-Server-Build-Id` observations.
 *
 * Used by the api-client `onResponseHeaders` interceptor (set up in
 * `@shared/api`) and consumed by `setupAutoUpdate` (`apps/web/src/sw/autoUpdate.ts`)
 * to gate the build-id mismatch hard-floor (PR-21 / stack-pulse 2026-05).
 *
 * Deliberately decoupled — the api-client lives in a shared package and
 * cannot depend on `apps/web/src/sw/*`; the SW autoUpdate module lives in
 * the web bundle and cannot reach into api-client config. This module is
 * the only place that knows about both sides.
 *
 * Notes:
 *   - Errors thrown inside an observer are swallowed (logged via `logger`)
 *     so one buggy subscriber cannot break the API flow.
 *   - `publish` is called from inside `onResponseHeaders`, which already
 *     runs on every response — keep it cheap.
 */

import { logger } from "@shared/lib";

export type ServerBuildIdObserver = (buildId: string) => void;

const observers = new Set<ServerBuildIdObserver>();

/**
 * Subscribe to `X-Server-Build-Id` observations from the api-client.
 * Returns an unsubscribe function (idempotent).
 */
export function subscribeServerBuildId(
  observer: ServerBuildIdObserver,
): () => void {
  observers.add(observer);
  return () => {
    observers.delete(observer);
  };
}

/**
 * Notify all subscribed observers about a server build id seen on a
 * response. No-op for empty / whitespace values — callers don't have
 * to pre-validate.
 */
export function publishServerBuildId(raw: string | null | undefined): void {
  if (typeof raw !== "string") return;
  const trimmed = raw.trim();
  if (trimmed === "") return;
  for (const observer of observers) {
    try {
      observer(trimmed);
    } catch (err) {
      // Swallow — one buggy observer must not affect others or the request.
      logger.warn("[serverBuildIdBus] observer threw", err);
    }
  }
}

/**
 * Test-only — wipe all observers. Avoid in production code paths.
 */
export function __resetServerBuildIdObserversForTests(): void {
  observers.clear();
}
