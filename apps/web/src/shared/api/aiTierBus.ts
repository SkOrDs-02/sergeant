/**
 * In-process pub-sub for `X-AI-Tier` observations (Pro tiered model
 * degradation — see `resolveProTier` in `apps/server/src/modules/chat/aiQuota.ts`).
 *
 * Mirrors `serverBuildIdBus`, but also keeps the last-seen tier so a
 * freshly-mounted `useAiTier()` consumer gets an immediate snapshot instead
 * of waiting for the next chat/coach response.
 *
 * Notes:
 *   - Errors thrown inside an observer are swallowed (logged via `logger`)
 *     so one buggy subscriber cannot break the API flow.
 *   - `publish` is called from inside `onResponseHeaders`, which already
 *     runs on every response — keep it cheap.
 */

import { logger } from "@shared/lib";

export type AiTier = "premium" | "standard" | "floor";

const VALID_TIERS: ReadonlySet<string> = new Set([
  "premium",
  "standard",
  "floor",
]);

export type AiTierObserver = (tier: AiTier) => void;

const observers = new Set<AiTierObserver>();
let lastTier: AiTier | null = null;

/**
 * Subscribe to `X-AI-Tier` observations from the api-client.
 * Returns an unsubscribe function (idempotent).
 */
export function subscribeAiTier(observer: AiTierObserver): () => void {
  observers.add(observer);
  return () => {
    observers.delete(observer);
  };
}

/** Last tier observed on any chat/coach response this session, or `null`. */
export function getLastAiTier(): AiTier | null {
  return lastTier;
}

/**
 * Notify all subscribed observers about a tier seen on a response. No-op
 * for missing / unrecognized values — callers don't have to pre-validate.
 */
export function publishAiTier(raw: string | null | undefined): void {
  if (typeof raw !== "string") return;
  const trimmed = raw.trim();
  if (!VALID_TIERS.has(trimmed)) return;
  const tier = trimmed as AiTier;
  lastTier = tier;
  for (const observer of observers) {
    try {
      observer(tier);
    } catch (err) {
      // Swallow — one buggy observer must not affect others or the request.
      logger.warn("[aiTierBus] observer threw", err);
    }
  }
}

/**
 * Test-only — wipe all observers and the last-seen tier. Avoid in
 * production code paths.
 */
export function __resetAiTierForTests(): void {
  observers.clear();
  lastTier = null;
}
