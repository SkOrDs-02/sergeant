# H9 — `transcribe` accepts 10 MB raw audio with only count-based quota

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Closed (partial — per-user USD cap enforced inline; S3 pre-signed upload deferred)

| Field          | Value                                                                |
| -------------- | -------------------------------------------------------------------- |
| **Severity**   | High (CVSS 7.0, AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H)                 |
| **Sprint**     | [Sprint 2](./sprint-2.md)                                            |
| **Owner**      | backend                                                              |
| **Effort**     | 0.5 person-day                                                       |
| **Status**     | Closed (partial — per-user USD cap enforced; S3 pre-signed deferred) |
| **Discovered** | 2026-05-03 deep security review                                      |
| **Closed**     | 2026-05-04 (PR pending — see Implementation log)                     |

## Summary

`POST /api/transcribe` accepts up to 10 MB of audio per request. The router
applies a per-user count-based quota and a global rate-limit but did not track
**USD spent**. A hostile (or curious) user can drive Groq Whisper costs into the
hundreds of dollars per day before tripping any guardrail, because each 10 MB
upload is a multi-cent inference call.

## Affected files

- `apps/server/src/modules/transcribe/transcribe.ts` — handler now calls
  `assertTranscribeUsdCap()` before Groq and `recordTranscribeUsdSpend()`
  after success.
- `apps/server/src/modules/transcribe/usdCap.ts` (**new**) — pre-charge
  estimator + post-charge UPSERT ledger.
- `apps/server/src/modules/transcribe/usdCap.test.ts` (**new**) — 19 unit
  cases covering tariff math, env override, happy path, cap-hit, fail-open,
  UPSERT contract.
- `apps/server/src/migrations/036_transcribe_usd_micros.sql` (**new**) —
  `ALTER TABLE ai_usage_daily ADD COLUMN usd_micros BIGINT NOT NULL DEFAULT 0
CHECK (usd_micros >= 0)`.
- `apps/server/src/obs/metrics.ts` — new `transcribe_usd_cap_events_total`
  Prometheus counter.

## Evidence

```ts
// apps/server/src/modules/transcribe/transcribe.ts:22
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
```

The router enforces "max N requests/day/user". With current Groq pricing
(`whisper-large-v3-turbo`) a single 10 MB clip is ~$0.04, so 100 quota slots
per user equal up to $4/user/day — multiplied by N users this is unbounded
spend.

## Impact

1. **Direct USD burn.** A compromised account with 100 daily slots can cost
   $4–$8/day (10 MB × 100 calls × Whisper price).
2. **Rate-limit bypass.** Quota slots reset at midnight UTC; "wait until reset"
   is a trivial bypass for a determined adversary.
3. **No abuse correlation.** No per-IP and per-user-USD ledger means we cannot
   detect a slow-burn attack that stays under the count limit but blasts
   maximum bytes.
4. **Operational risk.** Founder-only billing alerts only fire after 24 h of
   damage — there is no inline circuit breaker.

## Recommendation (as-shipped)

- **Per-user-per-day USD cap.** Default `$1.00 / user / day` (configurable via
  `TRANSCRIBE_USD_CAP_DAILY_MICROS` env var, in micros). Stored as
  `usd_micros BIGINT` on `ai_usage_daily` with `bucket = 'transcribe:<model>'`.
  Cap is enforced **before** the Groq call: pre-charge estimate from
  `Buffer.length` × tariff, deny with HTTP 402 if `spent + estimate > cap`.
- **Tariff is integer-only (micros).** 1 USD = 1_000_000 micros, $0.04 per
  10 MB clip = 40_000 micros. Linear tariff per byte; `Math.ceil` floors
  every charge to ≥ 1 micro to defeat fragment-based abuse.
- **Fail-open on DB failures.** When `ai_usage_daily` SELECT throws, the
  request proceeds (legitimate users are not blocked by infra outages), but
  `transcribe_usd_cap_events_total{outcome="store_unavailable"}` increments
  and `transcribe_usd_cap_store_unavailable` is logged at WARN.
- **Cap-hit telemetry.** `transcribe.usd_cap_hit` Pino warn event with
  `subject`, `day`, `bucket`, `spent_micros`, `cap_micros`, `audio_bytes`
  for ops alerting; Prometheus counter
  `transcribe_usd_cap_events_total{outcome="cap_hit"}` for aggregate views.
- **Day boundary = Europe/Kyiv.** Matches the existing chat-quota domain
  invariant ("23:00 UTC = 02:00 Kyiv = next day for cap purposes") so the cap
  resets when local users wake up, not when the UTC clock rolls over.

### Deferred (intentionally out of this PR)

- **Signed pre-flight URL (S3 multipart).** Current handler still buffers up
  to 10 MB in Express memory (`express.raw({ limit: "10mb" })`). The cap
  fix above closes the cost-burn vector; the memory-buffering issue is a
  separate concern and would require an S3 bucket + IAM + frontend rework.
  Tracked separately.
- **Abuse-detection auto-IP-ban.** "50+ rejected-quota responses per hour →
  auto IP ban + email founder" is not implemented in this PR. The
  `transcribe.usd_cap_hit` log lines are structured for ops alerting and
  Prometheus, but there is no automated ban path. Tracked separately.
- **Sentry inline alert.** The Pino warn already routes to the central log
  pipeline; explicit Sentry hook for `transcribe.usd_cap_hit` is left for
  the broader Sentry-events pass tracked under M-cards.
- **`Content-Length`-based early reject.** Express's `raw({ limit })` already
  rejects with 413 before fully reading the body when the header is set
  honestly. We deliberately use `req.body.length` (post-buffer) for the
  cap math to defeat lying `Content-Length` headers; the `limit: "10mb"`
  already provides the early-reject guarantee.

## Correction points (delivered)

- **`apps/server/src/migrations/036_transcribe_usd_micros.sql`**:
  `ALTER TABLE ai_usage_daily ADD COLUMN usd_micros BIGINT NOT NULL DEFAULT 0
CHECK (usd_micros >= 0)`. Pure ADD COLUMN — no two-phase plan needed
  (existing rows default to 0; old code reading the table without the column
  is unaffected because `SELECT *` is not used in any reader).
- **`apps/server/src/modules/transcribe/usdCap.ts`** (new):
  - `assertTranscribeUsdCap(req, res, audioBytes, model)` — pre-charge gate.
    Returns `{ ok: true|false, spent_micros, cap_micros, reason }`. Sends
    402 in `res` when not ok with code `TRANSCRIBE_USD_CAP`.
  - `recordTranscribeUsdSpend(req, audioBytes, model)` — UPSERT INSERT/ON
    CONFLICT increments `request_count` and `usd_micros` atomically.
- **`apps/server/src/modules/transcribe/transcribe.ts`**:
  - cap pre-check after MIME / size / query validation, before Groq.
  - post-success ledger record before `res.json()`.
- **`apps/server/src/obs/metrics.ts`**:
  - new `transcribe_usd_cap_events_total{outcome}` counter
    (`cap_hit` | `store_unavailable`).

## Verification (as-shipped)

- **Unit (`apps/server/src/modules/transcribe/usdCap.test.ts`):** 19 tests.
  - `estimateMicros` linear tariff math (10 MB → 40_000; 0 → 0; 1 MB →
    4_000; 4 bytes → 1 by `Math.ceil`).
  - `dailyCapMicros` env override (default $1; valid integer; `0` disables;
    invalid → fallback + warn).
  - Happy path: spent 0.10 USD + 0.04 USD estimate < $1 cap → ok=true.
  - Cap-hit: spent 0.99 USD + 0.04 USD estimate > $1 cap → 402,
    `TRANSCRIBE_USD_CAP`, `transcribe.usd_cap_hit` Pino warn,
    `transcribe_usd_cap_events_total{outcome=cap_hit}` incremented, no
    DB write.
  - Edge case: spent + estimate exactly equals cap → ok=true (`>` strict).
  - Fail-open: DB SELECT throws → ok=true, `store_unavailable` counter +
    structured warn.
  - Disabled cap (`TRANSCRIBE_USD_CAP_DAILY_MICROS=0`) → ok=true, no SELECT.
  - Missing subject (no `req.user`) → ok=true + warn (defensive, in case
    `requireSession()` is misconfigured upstream).
  - UPSERT: `INSERT INTO ai_usage_daily ... ON CONFLICT DO UPDATE SET
request_count = ... + 1, usd_micros = ... + EXCLUDED.usd_micros`.
  - 0-byte spend → no DB write.
  - DB write failure swallowed (legitimate Groq success not blocked).
- **Integration:** existing `apps/server/src/modules/transcribe/transcribe.test.ts`
  10 tests still green (29/29 across both files).
- **Manual / synthetic load:** Once DB column lands in staging, 25 × 10 MB
  clips trip the $1 cap (25 × $0.04 = $1.00).

## Implementation log

### 2026-05-04 — Initial close (cap enforced inline)

Shipped:

1. Migration `036_transcribe_usd_micros.sql` (ADD COLUMN, no two-phase).
2. `usdCap.ts` — pre-charge gate + post-charge UPSERT ledger; integer-only
   micros math; Europe/Kyiv day boundary.
3. `transcribe.ts` — handler wired to call `assertTranscribeUsdCap` before
   Groq and `recordTranscribeUsdSpend` on success.
4. Prometheus counter + structured Pino events for ops alerting.
5. 19 unit tests covering tariff, env override, happy/cap-hit/fail-open
   paths, UPSERT contract.

Deferred items (S3 pre-signed upload, auto-IP-ban, Sentry inline alert,
Content-Length-based early reject) listed under **Deferred** above with
explicit rationale. Card flips to **Closed (partial)** because the
cost-burn vector is closed in this PR; residual work is enrichment, not
severity-driving.

### Operational notes

- **Tariff drift:** Groq Whisper turbo pricing is hard-coded as 40_000
  micros / 10 MB ($0.04). When pricing changes, edit the constant in
  `usdCap.ts` and the test snapshot. Explicit constant beats env-only
  override because tariff is a code-level invariant, not a deploy-time
  config.
- **Cap override per environment:** set
  `TRANSCRIBE_USD_CAP_DAILY_MICROS=0` in CI/e2e to bypass the cap for
  load tests; `=5000000` in staging to allow $5/day for QA.
- **Fail-open vs fail-closed:** chosen fail-open because false-positive
  402 on a transient DB outage is worse for legitimate UX than fixed
  $1 burst at the same outage window. Telemetry catches the outage.

## Cross-references

- [`./M1-csp-disable-runtime-flag.md`](./M1-csp-disable-runtime-flag.md)
- [`./H6-email-verification.md`](./H6-email-verification.md) — same Sprint 2
  pattern: high-impact gate first, enrichment deferred with explicit log.
- [`../vulnerability-sla.md`](../vulnerability-sla.md)
