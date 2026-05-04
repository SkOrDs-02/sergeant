# M18 — OpenClaw daily $5 budget without per-call cap

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Closed (2026-05-04)

| Field          | Value                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**   | Medium                                                                                                                                           |
| **Sprint**     | [Sprint 3](./sprint-3.md)                                                                                                                        |
| **Owner**      | console                                                                                                                                          |
| **Effort**     | 0.1 person-day                                                                                                                                   |
| **Status**     | Closed (2026-05-04) — pre-flight cost estimator + guard in `apps/console/src/openclaw/policy.ts`; metric `openclaw.per_call_cap_hit_total` wired |
| **Discovered** | 2026-05-03 deep security review                                                                                                                  |

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

## Resolution (2026-05-04)

- `apps/console/src/openclaw/policy.ts` (new) — pure pre-flight cost
  estimator (`estimateMaxCallCostUsd`), pure decision (`checkPerCallCap`),
  guarded throw (`assertPerCallCapAllowed` →
  `PerCallCapExceededError`), env parser
  (`parseMaxPerCallUsd` для `OPENCLAW_MAX_PER_CALL_USD`).
  Default cap `DEFAULT_MAX_PER_CALL_USD = 0.50`. Pricing table
  (`MODEL_PRICING`) enumerates `claude-sonnet-4-6`,
  `claude-haiku-4-20250414`, `claude-opus-4-20250514`. **Fail-closed**
  defaults: unknown model → Opus pricing; unparseable env → default
  cap. Conservative estimate uses `max_tokens × output_price` (output
  cost dominates on Claude 4 pricing where output is 5× input).
- `apps/console/src/openclaw/policy.test.ts` (new) — 27-row table tests
  covering pricing, allow/reject decisions, env parser fallbacks, and
  `PerCallCapExceededError` payload locking.
- `apps/console/src/obs/metrics.ts` (new) — process-local counter
  module. Exposes `incrementCounter`, `getCounter`,
  `getMetricsSnapshot`, `resetMetricsForTesting`, and the public
  counter-name constant `OPENCLAW_PER_CALL_CAP_HIT_TOTAL =
"openclaw.per_call_cap_hit_total"` (locked by test so rename = breaking).
- `apps/console/src/obs/metrics.test.ts` (new) — locks counter name +
  semantics.
- `apps/console/src/agents/openclaw.ts` — pre-flight `assertPerCallCapAllowed`
  call before `runAgentLoop`; on `PerCallCapExceededError`, increments
  the metric and re-throws (caller-side surfacing). Exports
  `OPENCLAW_MODEL` / `OPENCLAW_MAX_TOKENS` so the policy test fixtures
  match the production constants.
- `apps/console/src/openclaw/handler.ts` — catch-arm differentiates
  `PerCallCapExceededError` from generic agent error. Founder receives
  a structured Telegram reply with projected cost + cap so they
  understand exactly why the call was refused. The invocation
  `finalize` payload uses a distinct status `per_call_cap_exceeded`
  for telemetry so log queries can split this from generic `error`.

### Verification log (2026-05-04)

- Unit: `pnpm --filter @sergeant/console test src/openclaw/policy.test.ts` →
  27/27 passed (table tests cover sonnet/haiku/opus + unknown-model
  fail-closed + env-parser fallbacks).
- Unit: `pnpm --filter @sergeant/console test src/obs/metrics.test.ts`
  → 6/6 passed (locks counter name).
- Full suite: `pnpm --filter @sergeant/console test` → 235/235 passed
  (zero regression).
- `pnpm --filter @sergeant/console lint` → 0 errors, 1 baseline
  warning (`router.ts:48` `security/detect-non-literal-regexp`,
  pre-existing M11 baseline finding tracked in
  `audit-exceptions.md`).
- `pnpm --filter @sergeant/console typecheck` → clean.

## Cross-references

- [`./H9-transcribe-usd-cap.md`](./H9-transcribe-usd-cap.md)
- [`./M7-chat-tool-iteration-cap.md`](./M7-chat-tool-iteration-cap.md)
