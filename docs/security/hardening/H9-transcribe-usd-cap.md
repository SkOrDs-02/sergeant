# H9 — `transcribe` accepts 10 MB raw audio with only count-based quota

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                                |
| -------------- | ---------------------------------------------------- |
| **Severity**   | High (CVSS 7.0, AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H) |
| **Sprint**     | [Sprint 2](./sprint-2.md)                            |
| **Owner**      | backend                                              |
| **Effort**     | 0.5 person-day                                       |
| **Status**     | Open                                                 |
| **Discovered** | 2026-05-03 deep security review                      |

## Summary

`POST /api/transcribe` accepts up to 10 MB of audio per request. The router
applies a per-user count-based quota and a global rate-limit but does not track
**USD spent**. A hostile (or curious) user can drive Groq Whisper costs into the
hundreds of dollars per day before tripping any guardrail, because each 10 MB
upload is a multi-cent inference call.

## Affected files

- `apps/server/src/modules/transcribe/transcribe.ts:22` —
  `MAX_AUDIO_BYTES = 10 * 1024 * 1024`.
- `apps/server/src/modules/transcribe/router.ts` — quota / rate-limit
  middleware order.
- `apps/server/src/modules/quota/quota.ts` — per-user quota table.
- `apps/server/src/http/rateLimit.ts` — the new rate-limit-buckets schema.

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

## Recommendation

- Add a **per-user-per-day USD cap** (e.g. $1/day default, configurable per
  plan tier) in `usage_audit_log`. When the cap is hit, return 402/429 and emit
  a structured alert.
- Add **abuse detection**: 50+ rejected-quota responses per hour from one user
  → automatic IP ban + email to founder.
- Move large-audio uploads to a **signed pre-flight URL** (S3 multipart) so
  Express never buffers a 10 MB body in process memory.
- Reject `Content-Length` early (before reading body); confirm Express
  `raw({ limit })` returns `413` without buffering.
- Add a Sentry alert for `transcribe.cost_cap_hit` events.

## Correction points

- `apps/server/src/modules/quota/quota.ts` — add `usd_spent_total` and
  `usd_cap_daily` columns; bump migration number sequentially.
- `apps/server/src/modules/transcribe/router.ts` — pre-charge estimate based on
  `Content-Length`; deduct after Groq returns the actual bytes processed.
- `apps/server/src/http/rateLimit.ts` — extend the `rate_limit_buckets`
  schema with a `usd_spent_total_micro` column for per-user cumulative cost.
- `apps/server/src/obs/logger.ts` — add `transcribe.usd_cap_hit` event.
- `docs/runbooks/cost-cap-incident.md` (new) — playbook for "user X exceeded
  USD cap, what to do".

## Verification

- **Unit:** `POST /api/transcribe` with `Content-Length` over the daily USD
  budget returns 402 without invoking Groq.
- **Synthetic load:** 200 × 10 MB clips from a single user trip the cap at ~25
  successful calls (assuming $1/day cap and $0.04/clip).
- **Manual:** Sentry alert fires within 60 s of the first
  `transcribe.usd_cap_hit` event.

## Cross-references

- [`./M1-csp-disable-runtime-flag.md`](./M1-csp-disable-runtime-flag.md)
- [`../vulnerability-sla.md`](../vulnerability-sla.md)
