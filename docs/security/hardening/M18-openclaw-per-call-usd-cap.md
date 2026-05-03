# M18 — OpenClaw daily $5 budget without per-call cap

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Medium                                        |
| **Sprint**     | [Sprint 3](./sprint-3.md)                     |
| **Owner**      | console                                       |
| **Effort**     | 0.1 person-day                                |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

## Summary

`apps/console/src/openclaw/...` enforces a daily $5 budget. A single call
with an inflated `max_tokens` (or a model with higher per-token pricing) can
burn the entire budget in one round-trip, leaving the bot unusable for the
rest of the day.

## Recommendation

Add `MAX_PER_CALL_USD = 0.50` (configurable). Estimate the call cost from
`max_tokens × $/token` before dispatching; reject calls projected over the
cap with a structured Telegram error.

## Correction points

- `apps/console/src/openclaw/policy.ts` — pre-flight cost estimator and
  guard.
- `apps/console/src/openclaw/policy.test.ts` — table tests for known
  models / token counts.
- `apps/console/src/obs/metrics.ts` — `openclaw.per_call_cap_hit_total`.

## Verification

- **Unit:** call with `max_tokens=8000` and Sonnet pricing exceeds 0.50;
  rejected.
- **Operational:** Telegram message preview of the rejection contains the
  estimated cost so the operator understands why.

## Cross-references

- [`./H9-transcribe-usd-cap.md`](./H9-transcribe-usd-cap.md)
- [`./M7-chat-tool-iteration-cap.md`](./M7-chat-tool-iteration-cap.md)
