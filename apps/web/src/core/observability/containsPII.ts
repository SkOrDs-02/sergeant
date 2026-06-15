/**
 * @status Active
 * @owner @Skords-01
 *
 * Lightweight PII detector for analytics console-log gating (S8 guard).
 *
 * Purpose: prevent `console.log("[analytics]", event)` from emitting when
 * the event payload carries recognisable PII patterns, even if `scrubPII`
 * was supposed to redact them upstream.  This is a defense-in-depth check —
 * `scrubPII` already walks field names; this walks field **values** with
 * pattern matching so structural regressions (new field names, nested blobs)
 * cannot silently surface PII into Sentry breadcrumbs or DevTools screen-
 * share recordings.
 *
 * Design decisions:
 *   - Checks `Object.values` of the top-level event object (not deep-walk)
 *     to avoid false positives in nested structured data (UUIDs, URLs, etc.).
 *   - Two patterns only, matching the card spec (email + phone):
 *       - Email: local-part + `@` + at least one domain dot segment.
 *       - Phone: `+` followed by ≥ 6 digits (international format).
 *   - Returns `true` when PII is detected, `false` when safe to log.
 *   - Never throws — wrapped in try/catch so a malformed value never
 *     breaks the analytics fire-and-forget contract.
 *
 * This module is intentionally tiny (no imports) so it tree-shakes cleanly
 * and never adds to the critical-path bundle.
 */

/** Email pattern: `local@host.tld` */
const EMAIL_RE = /[\w.+-]{1,64}@[\w-]+(?:\.[\w-]+)+/;

/** Phone pattern: `+` followed by 6 or more digits (E.164 / international) */
const PHONE_RE = /\+\d{6,}/;

/**
 * Returns `true` when any string value in the top-level `event` object
 * matches a known PII pattern (email or phone number).
 *
 * @param event - Any object (typically `{ eventName, payload, timestamp }`).
 * @returns `true` if PII detected, `false` if safe to log.
 */
export function containsPII(event: unknown): boolean {
  try {
    if (event == null || typeof event !== "object") return false;
    for (const val of Object.values(event as Record<string, unknown>)) {
      if (typeof val === "string") {
        if (EMAIL_RE.test(val) || PHONE_RE.test(val)) return true;
      } else if (val != null && typeof val === "object") {
        // One level deep: inspect payload values too.
        for (const inner of Object.values(val as Record<string, unknown>)) {
          if (typeof inner === "string") {
            if (EMAIL_RE.test(inner) || PHONE_RE.test(inner)) return true;
          }
        }
      }
    }
    return false;
  } catch {
    // If anything goes wrong (circular refs, non-standard exotic objects),
    // treat as PII-present to err on the safe side.
    return true;
  }
}
