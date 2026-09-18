# `/api/internal/*` HMAC signing — rollout playbook

> **Last touched:** 2026-09-16 by @claude. **Next review:** 2027-09-29.
> **Status:** Active (enforced by default since 2026-09-16).

> ⚠️ **n8n виведено з репо ([ADR-0090](../adr/0090-n8n-decommissioned.md), 2026-09-02).** Server-side middleware і env-тріо чинні; n8n-side кроки (Function-node template, manifest `hmacSigned`, validator) — історичні, файли — у permalink-снапшоті, а **§ Rollout нижче — історичний n8n-плейбук**, виконувати його нема на чому. **Рішення ухвалене 2026-09-16 (власник): `WEBHOOK_HMAC_REQUIRED` тепер `true` за замовчуванням** (`apps/server/src/env/env.ts`). Grace-режим обґрунтовувався поетапною міграцією 25 n8n-воркфлоу; після ADR-0090 єдині внутрішні caller-и — CI/admin-тулінг, який ми контролюємо, тож вікно лишилось без предмета. **Застереження, важливіше за сам прапорець:** він нічого не вмикає без `WEBHOOK_HMAC_SECRET` — верифікатор виходить із `ok`, коли секрет порожній. Таку конфігурацію тепер видно: `assertStartupEnv` пише при старті `WEBHOOK_HMAC_REQUIRED=true but WEBHOOK_HMAC_SECRET is empty`.
> **Owner:** ops + server.
> **Related:** [`better-auth-audit-2026-05.md`](./better-auth-audit-2026-05.md), [`logging-redaction-policy.md`](./logging-redaction-policy.md), [`docs/operations/observability/alert-bot-routing.md`](../../operations/observability/alert-bot-routing.md).

## Why

PR-48 (Better Auth security review, #2663) flagged the shared
`INTERNAL_API_KEY` bearer on `/api/internal/*` as a single point of
failure: anyone who exfiltrates the key (n8n debug log, env-var leak in
CI, accidental `console.log` in a Function-node) can forge requests as
n8n. We layer HMAC-SHA256 webhook signing on top so an attacker also
needs `WEBHOOK_HMAC_SECRET` — defence in depth.

## Wire-protocol

Per request, the caller (historically the n8n side; today any internal client) sends three headers (the bearer is unchanged):

| Header          | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| `Authorization` | `Bearer <INTERNAL_API_KEY>` (unchanged)                            |
| `X-Timestamp`   | UNIX seconds, e.g. `1731000000`                                    |
| `X-Signature`   | `hex(HMAC-SHA256(WEBHOOK_HMAC_SECRET, "<X-Timestamp>.<rawBody>"))` |

`rawBody` is the EXACT bytes of the HTTP body that hit the wire (not the
parsed JSON object — JSON-encoder differences invalidate the signature).
The timestamp prefix is what prevents replay if `WEBHOOK_HMAC_SECRET`
leaks and an attacker captures a single legitimate request body.

Server side: [`apps/server/src/http/verifyWebhookSignature.ts`](../../../apps/server/src/http/verifyWebhookSignature.ts).
n8n side template: [`ops/n8n-workflows/_lib/sign-internal-request.js`](https://github.com/SkOrDs-02/sergeant/blob/ffdf694cb60dcfeebc2c1de14887c5a8a1d71e6b/ops/n8n-workflows/_lib/sign-internal-request.js).

## Three env-vars

```dotenv
WEBHOOK_HMAC_SECRET=          # 32+ bytes; openssl rand -hex 32
WEBHOOK_HMAC_REQUIRED=true    # default since 2026-09-16; set false only as a deliberate opt-out
WEBHOOK_HMAC_TS_TOLERANCE_SEC=300
```

- **`WEBHOOK_HMAC_SECRET=""`** — feature OFF. Middleware is a no-op.
  Use this for local dev where you don't want to wire n8n at all.
- **`WEBHOOK_HMAC_REQUIRED=true`** (default since 2026-09-16) — missing or
  invalid signature → `401 Invalid webhook signature` with
  `code: WEBHOOK_HMAC_INVALID` and a `reason` enum in the body. Note this
  only bites when `WEBHOOK_HMAC_SECRET` is set: with an empty secret the
  middleware is a no-op and the flag means nothing (the server warns about
  that combination at boot).
- **`WEBHOOK_HMAC_REQUIRED=false`** — verifies signatures opportunistically.
  On mismatch it logs `webhook_hmac_mismatch` (Pino `warn`) + adds a Sentry
  breadcrumb, but the request still passes through. This was the grace mode
  for the staged n8n rollout; with n8n gone (ADR-0090) it is a deliberate,
  temporary opt-out for onboarding a new internal caller — not a resting
  state.

`X-Timestamp` is clock-skew-tolerant by `WEBHOOK_HMAC_TS_TOLERANCE_SEC`
(default 5min, symmetric — past _and_ future). 5min matches Stripe,
GitHub, and Slack webhook signatures. Beyond that window, the verifier
emits `timestamp_out_of_window`.

## Rollout _(historical — n8n, retired by ADR-0090)_

> Чек-лист нижче описує міграцію n8n-воркфлоу на Railway — обидва виведені ([ADR-0090](../adr/0090-n8n-decommissioned.md), [ADR-0074](../adr/0074-hosting-hetzner-coolify.md)). Лишено як запис того, чому grace-режим існує; кроки 1–5 і 7 виконувати немає на чому. Новому внутрішньому клієнту достатньо wire-protocol вище плюс `WEBHOOK_HMAC_SECRET` у його env.

Per-workflow checklist:

1. **Add the signer Function-node** to the workflow JSON immediately
   before the HTTP-Request node that calls `/api/internal/...`. Use
   the template at [`ops/n8n-workflows/_lib/sign-internal-request.js`](https://github.com/SkOrDs-02/sergeant/blob/ffdf694cb60dcfeebc2c1de14887c5a8a1d71e6b/ops/n8n-workflows/_lib/sign-internal-request.js).
2. **Switch the HTTP-Request body type to "Raw"** and reference
   `={{ $json.bodyJson }}` so the bytes don't get re-encoded.
3. **Add `X-Signature` and `X-Timestamp` headers** in the same node,
   referencing `={{ $json.xSignature }}` and `={{ $json.xTimestamp }}`.
4. **Set `WEBHOOK_HMAC_SECRET`** on the n8n Railway env. Use the same
   value as the server (rotate together via [`rotate-secrets.md`](../../start/instructions/rotate-secrets.md)).
5. **Update `manifest.json`** for the workflow:
   ```json
   "hmacSigned": true,
   "requiredEnv": ["…", "WEBHOOK_HMAC_SECRET"]
   ```
   The (historical, removed) validator `pnpm ops:n8n:validate` enforced that
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

If `WEBHOOK_HMAC_SECRET` is compromised: rotate per [`rotate-secrets.md`](../../start/instructions/rotate-secrets.md) (root path: `docs/start/instructions/rotate-secrets.md`).
The replay window (5min) means a leaked signature is useless after a
few minutes anyway, but key rotation invalidates everything immediately.

## See also

- Implementation: [`apps/server/src/http/verifyWebhookSignature.ts`](../../../apps/server/src/http/verifyWebhookSignature.ts)
- Tests: [`apps/server/src/http/verifyWebhookSignature.test.ts`](../../../apps/server/src/http/verifyWebhookSignature.test.ts)
- Better Auth audit (parent ticket): [`better-auth-audit-2026-05.md`](./better-auth-audit-2026-05.md)
- Internal-route bearer guard: [`apps/server/src/routes/internal/index.ts`](../../../apps/server/src/routes/internal/index.ts)
