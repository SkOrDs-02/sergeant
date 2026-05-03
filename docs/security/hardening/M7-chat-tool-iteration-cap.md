# M7 — Chat agent loop has no `MAX_TOOL_ITERATIONS` cap

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Medium                                        |
| **Sprint**     | [Sprint 3](./sprint-3.md)                     |
| **Owner**      | backend                                       |
| **Effort**     | 0.25 person-day                               |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

## Summary

`apps/server/src/modules/chat/chat.ts` enforces `MAX_TEXT_CONTINUATIONS=3`
but does not cap the orthogonal `tool_use → tool_result → tool_use` loop.
Anthropic can return a long chain of tool calls without text, so a malicious
or malfunctioning prompt can drive arbitrarily many tool round-trips before
hitting the existing cap.

## Recommendation

- Hard cap `MAX_TOOL_ITERATIONS=8` regardless of text-continuation count.
- Track per-request total tokens consumed (read from Anthropic response
  headers); if budget exceeded, terminate with a structured error.
- Emit a metric `chat.tool_iteration_cap_hit_total` and route to Sentry.

## Correction points

- `apps/server/src/modules/chat/chat.ts` — wrap the agent loop in a
  `for (let i = 0; i < MAX_TOOL_ITERATIONS; i++)` guard; on overflow throw a
  `ChatLoopError("max_tool_iterations")` and surface 422 to the client.
- `apps/server/src/modules/chat/chat.test.ts` — drive a fake provider that
  returns 9 sequential tool calls; expect the 9th to be rejected.

## Verification

- **Unit:** synthetic loop of 9 tool calls; the 9th invocation raises and
  the metric counter increments.
- **Sentry:** no untagged "chat hung" error reports for one week post-deploy.

## Cross-references

- [`./M8-prompt-injection-tool-output.md`](./M8-prompt-injection-tool-output.md)
- [`./H9-transcribe-usd-cap.md`](./H9-transcribe-usd-cap.md)
