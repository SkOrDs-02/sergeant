# `/api/internal/*` HMAC signing — rollout playbook

> **Status:** Active (grace mode).
> **Owner:** ops + server.
> **Related:** [`better-auth-audit-2026-05.md`](./better-auth-audit-2026-05.md), [`logging-redaction-policy.md`](./logging-redaction-policy.md), [`docs/observability/alert-bot-routing.md`](../observability/alert-bot-routing.md).

## Why

PR-48 (Better Auth security review, #2663) flagged the shared
`INTERNAL_API_KEY` bearer on `/api/internal/*` as a single point of
failure: anyone who exfiltrates the key (n8n debug log, env-var leak in
CI, accidental `console.log` in a Function-node) can forge requests as
n8n. We layer HMAC-SHA256 webhook signing on top so an attacker also
needs `WEBHOOK_HMAC_SECRET` — defence in depth.

## Wire-protocol

Per request, the n8n side sends three headers (the bearer is unchanged):

| Header          | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| `Authorization` | `Bearer <INTERNAL_API_KEY>` (unchanged)                            |
| `X-Timestamp`   | UNIX seconds, e.g. `1731000000`                                    |
| `X-Signature`   | `hex(HMAC-SHA256(WEBHOOK_HMAC_SECRET, "<X-Timestamp>.<rawBody>"))` |

`rawBody` is the EXACT bytes of the HTTP body that hit the wire (not the
parsed JSON object — JSON-encoder differences invalidate the signature).
The timestamp prefix is what prevents replay if `WEBHOOK_HMAC_SECRET`
leaks and an attacker captures a single legitimate request body.

Server side: [`apps/server/src/http/verifyWebhookSignature.ts`](../../apps/server/src/http/verifyWebhookSignature.ts).
n8n side template: [`ops/n8n-workflows/_lib/sign-internal-request.js`](../../ops/n8n-workflows/_lib/sign-internal-request.js).

## Three env-vars

```dotenv
WEBHOOK_HMAC_SECRET=          # 32+ bytes; openssl rand -hex 32
WEBHOOK_HMAC_REQUIRED=false   # see "Rollout" below
WEBHOOK_HMAC_TS_TOLERANCE_SEC=300
```

- **`WEBHOOK_HMAC_SECRET=""`** — feature OFF. Middleware is a no-op.
  Use this for local dev where you don't want to wire n8n at all.
- **`WEBHOOK_HMAC_REQUIRED=false`** (default during rollout) — middleware
  verifies signatures opportunistically. On mismatch, it logs
  `webhook_hmac_mismatch` (Pino `warn`) + adds a Sentry breadcrumb, but
  the request still passes through. This is the period where ops can
  add the Function-node signer to one workflow at a time without
  breaking the others.
- **`WEBHOOK_HMAC_REQUIRED=true`** — flip after every wired workflow
  shows `hmacSigned: true` in `ops/n8n-workflows/manifest.json`. From
  then on, missing/invalid signature → `401 Invalid webhook signature`
  with `code: WEBHOOK_HMAC_INVALID` and a `reason` enum in the body.

`X-Timestamp` is clock-skew-tolerant by `WEBHOOK_HMAC_TS_TOLERANCE_SEC`
(default 5min, symmetric — past _and_ future). 5min matches Stripe,
GitHub, and Slack webhook signatures. Beyond that window, the verifier
emits `timestamp_out_of_window`.

## Rollout

Per-workflow checklist:

1. **Add the signer Function-node** to the workflow JSON immediately
   before the HTTP-Request node that calls `/api/internal/...`. Use
   the template at [`ops/n8n-workflows/_lib/sign-internal-request.js`](../../ops/n8n-workflows/_lib/sign-internal-request.js).
2. **Switch the HTTP-Request body type to "Raw"** and reference
   `={{ $json.bodyJson }}` so the bytes don't get re-encoded.
3. **Add `X-Signature` and `X-Timestamp` headers** in the same node,
   referencing `={{ $json.xSignature }}` and `={{ $json.xTimestamp }}`.
4. **Set `WEBHOOK_HMAC_SECRET`** on the n8n Railway env. Use the same
   value as the server (rotate together via [`rotate-secrets.md`](../playbooks/rotate-secrets.md)).
5. **Update `manifest.json`** for the workflow:
   ```json
   "hmacSigned": true,
   "requiredEnv": ["…", "WEBHOOK_HMAC_SECRET"]
   ```
   The validator (`pnpm ops:n8n:validate`) enforces that
   `hmacSigned: true` ⇒ `WEBHOOK_HMAC_SECRET` ∈ `requiredEnv`.
6. **Test against staging.** With the server still on
   `WEBHOOK_HMAC_REQUIRED=false`, you'll see in Grafana / Sentry whether
   `webhook_hmac_mismatch` warnings drop to zero for this workflow's
   path. If they don't, fix the signing code; the server is still
   passing the requests through, so prod traffic isn't blocked.
7. Once all 25 `INTERNAL_API_KEY`-using workflows show `hmacSigned: true`
   and the staging `webhook_hmac_mismatch` rate is zero for ≥24h:
   **flip `WEBHOOK_HMAC_REQUIRED=true`** on the server. Watch the same
   metrics + 401 rate for one hour.

## Observability

- **Pino warn** `webhook_hmac_mismatch` — fields: `reason`, `path`,
  `method`, `required`. No body, no signature, no bearer (HR #21).
- **Sentry breadcrumb** `category: webhook.hmac` — same shape.
  Level is `warning` in required mode, `info` in grace mode, so you
  can dashboard each separately.
- **`reason` enum** — `missing_signature`, `missing_timestamp`,
  `malformed_timestamp`, `timestamp_out_of_window`, `raw_body_unavailable`,
  `signature_mismatch`.

## Disable / kill-switch

Set `WEBHOOK_HMAC_REQUIRED=false` to revert to grace mode (existing 401s
stop). Set `WEBHOOK_HMAC_SECRET=""` to fully disable verification (no-op
middleware). The bearer-token guard remains active in both cases.

If `WEBHOOK_HMAC_SECRET` is compromised: rotate per [`rotate-secrets.md`](../playbooks/rotate-secrets.md) (root path: `docs/playbooks/rotate-secrets.md`).
The replay window (5min) means a leaked signature is useless after a
few minutes anyway, but key rotation invalidates everything immediately.

## See also

- Implementation: [`apps/server/src/http/verifyWebhookSignature.ts`](../../apps/server/src/http/verifyWebhookSignature.ts)
- Tests: [`apps/server/src/http/verifyWebhookSignature.test.ts`](../../apps/server/src/http/verifyWebhookSignature.test.ts)
- Better Auth audit (parent ticket): [`better-auth-audit-2026-05.md`](./better-auth-audit-2026-05.md)
- Internal-route bearer guard: [`apps/server/src/routes/internal/index.ts`](../../apps/server/src/routes/internal/index.ts)
