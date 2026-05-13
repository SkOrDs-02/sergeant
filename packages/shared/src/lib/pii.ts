/**
 * Single source of truth for PII / secret key redaction.
 *
 * Why this lives in `@sergeant/shared` instead of `apps/server/src/obs/logger.ts`:
 * the same key list must drive **three** enforcers across packages that do not
 * share a runtime — pino redaction (server logs), `Sentry.beforeSend` PII
 * scrubbing (server **and** web SDK), and OTel attribute denylist
 * (`apps/server/src/obs/tracing.ts`). Keeping it here closes the historical
 * gap where `apps/web/src/core/observability/sentry.ts:beforeSend` only
 * deleted cookies and missed every other field listed in
 * [`docs/security/pii-handling.md`](../../../../docs/security/pii-handling.md)
 * (audit `2026-05-03-web-deep-dive/04-security-observability-testing-devx.md`
 * §6.5 — outstanding follow-up).
 *
 * The implementation is intentionally **DOM-free and dependency-free** so it
 * stays importable from every workspace package (server, web, mobile,
 * tools/console) without dragging Sentry / pino / Express types along.
 *
 * Contract:
 *   - `REDACT_KEY_NAMES` — every field name that must be masked at any depth.
 *     Server pino-paths list (`redactPaths` in `apps/server/src/obs/logger.ts`)
 *     is intentionally **a superset** of this — pino's matcher does not walk
 *     deeply by default, so we mirror common one/two-level paths there while
 *     `scrubPII()` here handles arbitrary depth.
 *   - `scrubPII(value)` — mutates the object in place. Returns nothing on
 *     purpose: every caller wants the side effect, and forcing them to assign
 *     a return value is friction without benefit.
 *   - Sentinel value `PII_REDACTED` — exported so tests can assert it without
 *     hard-coding the string in three places.
 *
 * When adding a new field:
 *   1. Add it to `REDACT_KEY_NAMES` below (lowercase form — match is
 *      case-insensitive, see `REDACT_KEY_SET`).
 *   2. If pino-redaction needs a one-level path mirror, add it to
 *      `redactPaths` in `apps/server/src/obs/logger.ts`.
 *   3. Update the table in `docs/security/pii-handling.md` Class A/B/C.
 */

export const PII_REDACTED = "[redacted]";

/**
 * Canonical list of field names that MUST be redacted at any depth.
 *
 * Add new fields in alphabetical-within-section order to minimise merge
 * conflicts; case is ignored at match time (`scrubPII` lowercases keys
 * before lookup), but we keep canonical casing here for grep-ability.
 */
export const REDACT_KEY_NAMES: readonly string[] = [
  // Class A — credentials / secrets. Leak = sev:1 + rotate.
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "sessionToken",
  "apiKey",
  "secret",
  "clientSecret",
  "privateKey",
  "signature",
  "dsn",
  "connectionString",
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-token",
  "x-csrf-token",
  // Webhook secrets — header form. Browser SDK can capture them under
  // `event.request.headers` when fetch() is auto-instrumented.
  "x-mono-webhook-secret",
  "x-openclaw-webhook-secret",
  "x-api-secret",
  "x-internal-token",
  // Provider keys that occasionally land in `extra` diagnostics.
  "groqKey",
  "anthropicKey",
  "voyageKey",
  // Class B — personal identifiers (GDPR PII).
  "email",
  "phone",
];

const REDACT_KEY_SET: ReadonlySet<string> = new Set(
  REDACT_KEY_NAMES.map((k) => k.toLowerCase()),
);

/**
 * Recursively walks a structured value and replaces values stored under
 * `REDACT_KEY_NAMES` with `PII_REDACTED`. Mutation is in-place.
 *
 *   - Primitives, `null` and `undefined` are no-ops.
 *   - Arrays are descended element-wise.
 *   - Object values for redacted keys are nulled (preserves the field
 *     visually in Sentry UI without leaking nested structure).
 *   - Cycles are guarded via a `WeakSet`; `Error.cause` chains, JSON-LD
 *     graphs and Sentry's own envelope shapes are safe.
 *
 * The function does **not** parse string values for embedded PII — that
 * would create a false-positive minefield (UUIDs containing `e@`, etc.).
 * Callers wishing to redact URL paths (`/api/mono/webhook/<secret>`) should
 * use `apps/server/src/obs/sensitiveUrl.ts` before invoking `scrubPII`.
 */
export function scrubPII(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (value == null || typeof value !== "object") return;
  if (seen.has(value as object)) return;
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (const item of value) scrubPII(item, seen);
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (REDACT_KEY_SET.has(key.toLowerCase())) {
      // Keep the field type stable: replacing an object value with a string
      // breaks Sentry's "structured context" UI; null is rendered nicely.
      obj[key] = typeof obj[key] === "object" ? null : PII_REDACTED;
      continue;
    }
    scrubPII(obj[key], seen);
  }
}
