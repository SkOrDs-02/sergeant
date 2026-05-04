# M17 — Console rate-limit per Telegram user, no global cap

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | console                         |
| **Effort**     | 0.25 person-day                 |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`FixedWindowRateLimiter` (`tools/console/src/security.ts`,
`tools/console/src/index.ts:117–119`) keys per `chat.id` / `from.id`. While
the founder bot is allowlisted to one user, `consoleBot` (under
`CONSOLE_BOT_TOKEN`) supports N allowlisted users, each with their own
bucket. As the allowlist grows the aggregate rate scales linearly.

## Recommendation

- Add a global per-bot cap (all allowlisted users combined) on top of the
  per-user bucket.
- Emit a metric when the global cap engages so we can see when scaling the
  allowlist becomes risky.

## Correction points

- `tools/console/src/security.ts` — extend `FixedWindowRateLimiter` to
  accept a secondary global key (e.g. `bot:console`); deny when either
  bucket is exhausted.
- `tools/console/src/obs/metrics.ts` — add
  `console.global_rate_cap_hit_total`.

## Verification

- **Unit:** five users each within their per-user budget collectively
  exceed the global cap; one of them receives the standard "too many
  requests" reply.
- **Operational:** in staging, monitor the new metric across a soak test.

## Cross-references

- [`./M15-console-allowlist-fail-closed.md`](./M15-console-allowlist-fail-closed.md)
- [`./M18-openclaw-per-call-usd-cap.md`](./M18-openclaw-per-call-usd-cap.md)
