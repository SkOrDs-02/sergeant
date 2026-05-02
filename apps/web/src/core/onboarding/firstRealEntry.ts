/**
 * Thin web adapter over `@sergeant/shared/lib/firstRealEntry`. The
 * shared module scans storage for non-demo entries and owns the
 * analytics dispatch contract; this file just wires it to
 * `localStorage` (via the `./vibePicks` adapter) and to the web
 * analytics sink.
 */

import { detectFirstRealEntry as sharedDetectFirstRealEntry } from "@sergeant/shared";
import { hasAnyRealEntry as sharedHasAnyRealEntry } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage";
import { trackEvent } from "../observability/analytics";

/**
 * Returns true if the user has at least one non-demo entry anywhere.
 * Called on every dashboard render; O(modules) and cheap (no reserialize).
 *
 * Exported for the hub shell: «Звіти» tab is hidden until this becomes
 * true — an empty reports view is worse than no tab at all.
 */
export function hasAnyRealEntry(): boolean {
  return sharedHasAnyRealEntry(webKVStore);
}

/**
 * Call on every render of the dashboard. If the user has a real entry
 * and we haven't fired yet, fire `first_real_entry` and persist the
 * flag so this becomes a no-op for all future renders.
 */
export function detectFirstRealEntry(): boolean {
  return sharedDetectFirstRealEntry(webKVStore, { trackEvent });
}
