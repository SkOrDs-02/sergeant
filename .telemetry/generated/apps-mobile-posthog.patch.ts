/**
 * Patch for apps/mobile/src/lib/observability/posthog.ts —
 * adds `setPostHogPersonProperties(traits)` so the mobile identity
 * wrapper can push trait updates without re-issuing identify.
 *
 * APPLY: append this function to the existing posthog.ts (alongside
 * `identifyPostHogUser` / `resetPostHog` exports). Keep all existing
 * code intact.
 *
 * Implementation: posts an `$identify` event with `$set` properties
 * for the current distinct_id. PostHog ingests this as a person-
 * property update without changing identity. Pattern documented at:
 *   https://posthog.com/docs/product-analytics/person-properties
 *
 * NOTE: relies on the existing `state` / `enqueue` infra in posthog.ts;
 * paste this inside the same module, after `resetPostHog`.
 */

// ── append to apps/mobile/src/lib/observability/posthog.ts ────────────

import type { IdentifyTraits } from "./identifyTraits";

// ↑ this import may already be present if identifyTraits is referenced
// elsewhere in the file; otherwise add it.

/**
 * Updates PostHog person properties without re-issuing identify.
 * Use for on-change traits (plan flip, pwa_installed, mono_connected, …)
 * once the user is already identified.
 */
export function setPostHogPersonProperties(
  traits: Partial<IdentifyTraits>,
): void {
  if (!state) {
    // Reuse the same buffer treatment as capture/identify so traits set
    // before init are not lost. Encode as a capture of `$identify`
    // with `$set`; matches how the post-init path will dispatch.
    enqueue({
      kind: "capture",
      name: "$identify",
      payload: { $set: traits },
    });
    return;
  }
  void postCapture("$identify", { $set: traits });
}
