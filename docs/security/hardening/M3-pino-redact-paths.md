# M3 — Pino `redactPaths` is incomplete for security headers and URLs

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-04) — see Resolution log.

| Field          | Value                                                  |
| -------------- | ------------------------------------------------------ |
| **Severity**   | Medium (CVSS 5.3, AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N) |
| **Sprint**     | [Sprint 2](./sprint-2.md)                              |
| **Owner**      | platform                                               |
| **Effort**     | 0.25 person-day                                        |
| **Status**     | **Closed** (2026-05-04)                                |
| **Discovered** | 2026-05-03 deep security review                        |

## Summary

`apps/server/src/obs/logger.ts` redacts a base set of fields (`authorization`,
`cookie`, `password`) but misses several secret-bearing inputs that this audit
discovered downstream — `X-Mono-Webhook-Secret`, `X-API-Secret`,
`X-OpenClaw-Webhook-Secret`, `req.url` and `req.originalUrl` (relevant while
[C1](./C1-mono-webhook-secret-in-url.md) is being fixed), provider keys
(`groqKey`, `anthropicKey`, `voyageKey`), error-config headers from axios/got,
and `req.body.password` / `req.body.token` safety nets.

## Affected files

- `apps/server/src/obs/logger.ts:24–48`
- Sentry beforeSend (currently doesn't carry header redaction either —
  partially covered by [C1](./C1-mono-webhook-secret-in-url.md)).

## Evidence

```ts
// apps/server/src/obs/logger.ts
const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  // missing: x-mono-webhook-secret, x-api-secret, x-openclaw-webhook-secret,
  //          req.url, req.originalUrl, groqKey, anthropicKey, voyageKey,
  //          req.body.password, req.body.token, err.config.headers.Authorization
];
```

## Impact

1. **Direct secret leak.** A debug log on the Mono webhook handler can dump the
   incoming `req` object verbatim and expose the secret in plaintext.
2. **Provider-key leak.** When AI calls fail, error captures often include the
   request config (axios `err.config.headers.Authorization`).
3. **Legacy URL leak.** While [C1](./C1-mono-webhook-secret-in-url.md) is being
   rolled out, every access log line still contains the secret in the URL
   path; redacting `req.url` short-circuits that exposure.

## Recommendation

Extend `redactPaths` to:

```ts
const redactPaths = [
  // existing
  "req.headers.authorization",
  "req.headers.cookie",

  // Sergeant-specific secrets
  "req.headers['x-api-secret']",
  "req.headers['x-mono-webhook-secret']",
  "req.headers['x-openclaw-webhook-secret']",
  "req.headers['x-internal-token']",

  // URL leakage during C1 rollout
  "req.url",
  "req.originalUrl",

  // provider keys
  "groqKey",
  "anthropicKey",
  "voyageKey",

  // body safety nets
  "req.body.password",
  "req.body.token",

  // axios/got error captures
  "err.config.headers.Authorization",
  "err.config.headers['x-mono-webhook-secret']",
];
```

## Correction points

- `apps/server/src/obs/logger.ts` — extend the array.
- `apps/server/src/obs/logger.test.ts` — table-driven test that emits a log
  with each forbidden path and asserts `[Redacted]` in the JSON output.
- `apps/server/src/app.ts` — Sentry `beforeSend` hook to also strip these
  fields from `event.request` and `event.exception.values[].mechanism.data`
  (alignment with [C1](./C1-mono-webhook-secret-in-url.md)).

## Verification

- **Unit:** for every entry in `redactPaths`, log an object containing that
  path with value `"SECRETSECRETSECRET"`; the resulting JSON must not contain
  the literal string.
- **Integration:** issue a forged webhook call with a header
  `X-Mono-Webhook-Secret: leaktest`; tail the Pino output and confirm
  `[Redacted]`.
- **Sentry:** trigger a synthetic axios error with a header authorization;
  confirm Sentry event payload contains `[Filtered]`.

## Cross-references

- [`./C1-mono-webhook-secret-in-url.md`](./C1-mono-webhook-secret-in-url.md)
- [`./M1-csp-disable-runtime-flag.md`](./M1-csp-disable-runtime-flag.md)

## Resolution log

### 2026-05-04 — closed

`apps/server/src/obs/logger.ts` розширено:

- **redactKeyNames** (Sentry-скрабер, recursive case-insensitive) тепер містить `x-mono-webhook-secret`, `x-openclaw-webhook-secret`, `x-api-secret`, `x-internal-token`, `groqKey`, `anthropicKey`, `voyageKey`.
- **redactPaths** (Pino, path-based) тепер містить:
  - `req.headers["x-mono-webhook-secret"]`, `req.headers["x-openclaw-webhook-secret"]`, `req.headers["x-api-secret"]`, `req.headers["x-internal-token"]`.
  - `groqKey` / `anthropicKey` / `voyageKey` у root + `*.<key>` (1 рівень вкладеності).
  - `req.body.password`, `req.body.token`, `req.body.currentPassword`, `req.body.newPassword`.
  - `err.config.headers.Authorization` / `authorization` / `Cookie` / `cookie` / `["x-mono-webhook-secret"]` (axios upstream-failure capture).

> **`req.url` / `req.originalUrl`** свідомо НЕ додано в redactPaths (повна редакція URL знищить корисність access-логу). Натомість використовуємо `redactSensitiveUrl()` з C1 — він редагує лише secret-bearing path-prefix-и (`/api/mono/webhook/<secret>`), залишаючи решту URL читабельною. Цей хелпер вже інтегрований у `errorHandler.ts` і Sentry `applyBeforeSend`/`applyBeforeBreadcrumb` (PR #1627).

**Tests.** `apps/server/src/obs/logger.test.ts` — table-driven `M3 — extended redactPaths coverage` (15 cases): для кожного нового entry дамп log → assert `[redacted]` у JSON-виводі. Sanity-перевірка нейтральних полів у тому ж payload-і.
