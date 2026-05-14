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
  // PR-48 follow-up (HMAC #2733): `signature` (key) already covers
  // `X-Signature`-named fields only at root; header keys arrive lowercased
  // and prefixed, so we need an explicit entry.
  "x-signature",
  "x-webhook-signature",
  "x-hmac-signature",
  // OTP / magic-link / verification flows. Pre-2026-05-13 these leaked
  // through `event.request.data` once we ever set up a form-state context
  // capture; today `request.data` is wholesale-deleted, but adding the
  // keys closes the secondary leak path through `setExtra({ otp })` or
  // accidental `req.body` echoes.
  "otp",
  "otpCode",
  "verificationCode",
  "verifyCode",
  "magicLink",
  "magicLinkToken",
  "resetToken",
  "passwordResetToken",
  "pin",
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

/**
 * Pattern-based PII scrubber for **string values** (error messages,
 * exception text, breadcrumb messages, query-string params).
 *
 * `scrubPII` (above) intentionally never inspects string contents — it
 * would create a false-positive minefield over user-entered free text
 * (chat messages, journal entries, etc.) and structured context where
 * UUID-like substrings happen to look like JWTs. This helper is the
 * **opt-in** complement: callers know which surface is high-risk
 * (Sentry `event.message`, `exception.value`, breadcrumb messages,
 * URL query-strings) and apply the regex pass explicitly.
 *
 * Patterns are intentionally conservative to keep false-positive rate
 * low — each pattern was chosen against historical real leaks (see
 * audit `docs/audits/2026-05-13-security-observability-roast.md`):
 *
 *   - **Email** — RFC 5322 simplified form. Matches `local@host.tld` and
 *     strips the local-part but preserves the domain hint
 *     (`[email redacted]@host.tld`) — domain alone is not PII per GDPR
 *     Art. 4(1) when stripped of the identifier; helps incident triage
 *     (e.g. `*@enterprise.com` reveals tenant scope without exposing
 *     individual users).
 *   - **Telegram bot token** — `<bot-id>:<35-char-base64>`; tokens leak
 *     when ops Function-nodes log `console.error("send failed", JSON.stringify(resp))`.
 *   - **JWT** — three URL-safe-base64 segments joined by `.` with the
 *     middle segment ≥ 16 chars (filters out short UUIDs like
 *     `abc.def.ghi`). Sergeant doesn't issue JWTs (Better Auth uses
 *     opaque session cookies) but upstream `axios` / `fetch` calls to
 *     third-party APIs sometimes capture them in error bodies.
 *   - **AWS Access Key ID** — `AKIA` / `ASIA` / `AGPA` prefix +
 *     16 alphanumerics. Catches the most common shape; not exhaustive
 *     (Amazon publishes the full list at
 *     https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html
 *     — we accept the false-negative rate in favour of keeping the
 *     regex narrow and low-cost).
 *   - **Bearer token in error text** — `bearer <opaque>` substring, since
 *     axios `error.response.config.headers.Authorization` sometimes
 *     ends up serialised into a stack trace through interceptors that
 *     throw `new Error(\`upstream failed: \${JSON.stringify(resp)}\`)`.
 *
 * Returns the scrubbed string. Never throws. Empty / non-string input
 * collapses to the original value so it is safe to call unconditionally.
 */
export const PII_STRING_PATTERNS: ReadonlyArray<{
  readonly name: string;
  readonly pattern: RegExp;
  readonly replacement: string;
}> = [
  {
    name: "email",
    // Conservative — requires `@` + at least one dot in the domain.
    // Captures local-part separately so we can preserve domain hint.
    pattern: /\b([\w.+-]{1,64})@([\w-]+(?:\.[\w-]+)+)\b/g,
    replacement: "[email redacted]@$2",
  },
  {
    name: "telegram-bot-token",
    // Telegram bot tokens — `<numeric-id>:<35-char-token>` (the token
    // half is URL-safe base64 with `_` and `-`). Numeric prefix is
    // typically 9–11 digits; we accept 5–15 to keep the rule simple.
    pattern: /\b\d{5,15}:[A-Za-z0-9_-]{30,45}\b/g,
    replacement: "[telegram-token redacted]",
  },
  {
    name: "jwt",
    // 3 base64url segments separated by `.`, payload at least 16 chars
    // (filters out short identifier-like triples).
    pattern: /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: "[jwt redacted]",
  },
  {
    name: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|APKA)[A-Z0-9]{16}\b/g,
    replacement: "[aws-key redacted]",
  },
  {
    name: "bearer-token",
    // `Bearer ` + opaque token (≥ 16 chars to avoid false-positives on
    // header dumps where the placeholder string is short).
    pattern: /\b[Bb]earer\s+[A-Za-z0-9._-]{16,}/g,
    replacement: "Bearer [redacted]",
  },
];

export function scrubPIIString(value: string): string {
  if (!value || typeof value !== "string") return value;
  let out = value;
  for (const { pattern, replacement } of PII_STRING_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Sensitive URL query-string parameter names that must be replaced with
 * `[redacted]` before the URL is sent to Sentry or any other observability
 * sink. The list mirrors `REDACT_KEY_NAMES` for the most common
 * surface-level leaks; deep / case-insensitive matching is provided by
 * `redactSensitiveQueryParams` below.
 *
 * Why a separate list (not just `REDACT_KEY_NAMES`)?  Query-string
 * conventions skew toward snake_case (`api_key`, `access_token`) while
 * the structured-context list uses camelCase (`apiKey`, `accessToken`).
 * Maintaining the alias here keeps both grep-friendly.
 */
export const SENSITIVE_QUERY_PARAM_NAMES: ReadonlySet<string> = new Set([
  "token",
  "api_key",
  "apikey",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "idtoken",
  "secret",
  "client_secret",
  "clientsecret",
  "signature",
  "x-signature",
  "code", // OAuth authorization code; covers /auth/callback?code=...
  "state", // OAuth state often carries CSRF token in compact form
  "magic_link",
  "magiclink",
  "magic_link_token",
  "magiclinktoken",
  "otp",
  "verify_code",
  "verifycode",
  "verification_code",
  "verificationcode",
  "password",
]);

/**
 * Replaces values of sensitive query-string parameters with `[redacted]`
 * inside an absolute or path-relative URL. Returns the input unchanged
 * when no `?`-delimited query is present.
 *
 * Conservative parser — does not try to handle malformed URLs; falls
 * back to splitting on `?` once and walking pairs joined by `&`. We
 * cannot use `URL` here because Sentry sometimes captures path-relative
 * strings (`/auth/callback?token=...`) that `new URL()` rejects without
 * a base.
 */
export function redactSensitiveQueryParams(url: string): string {
  if (!url || typeof url !== "string") return url;
  const qIdx = url.indexOf("?");
  if (qIdx < 0) return url;

  const hashIdx = url.indexOf("#", qIdx);
  const queryEnd = hashIdx < 0 ? url.length : hashIdx;
  const head = url.slice(0, qIdx + 1);
  const tail = hashIdx < 0 ? "" : url.slice(hashIdx);
  const queryPart = url.slice(qIdx + 1, queryEnd);

  const pairs = queryPart.split("&").map((pair) => {
    const eq = pair.indexOf("=");
    if (eq < 0) return pair;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (SENSITIVE_QUERY_PARAM_NAMES.has(name.toLowerCase())) {
      return `${name}=${PII_REDACTED}`;
    }
    return `${name}=${value}`;
  });

  return `${head}${pairs.join("&")}${tail}`;
}
