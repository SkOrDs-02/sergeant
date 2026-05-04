# M7 — Chat agent loop has no `MAX_TOOL_ITERATIONS` cap

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Closed (2026-05-04)

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | backend                         |
| **Effort**     | 0.25 person-day                 |
| **Status**     | Closed (2026-05-04)             |
| **Discovered** | 2026-05-03 deep security review |

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

## Resolution (2026-05-04)

Закрито batched M7 + M12 hardening PR.

**Що зроблено:**

- `apps/server/src/modules/chat/chat.ts` — додано `export const MAX_TOOL_ITERATIONS = 8` і helper `rejectWithToolIterationCap(res, boundary, observed)`, який повертає 422 з `{code: "MAX_TOOL_ITERATIONS", detail: {boundary, observed, max}}` і інкрементить метрику. Cap перевіряється у двох точках round-trip-у:
  1. **Anthropic-side** — після `extractAnthropicText` рахуємо `toolUses.length`; якщо >8, refund-имо AI-quota (`refundQuotaOnUpstreamFailure`) і б'ємо 422 з `boundary="anthropic_response"` ДО `recordToolProposals`, щоб не забруднити `chat_tool_invocations_total{outcome="proposed"}`.
  2. **Client-side** — на тулрезалт-гілці хендлера фільтруємо `tool_calls_raw.filter(b => b.type === "tool_use")`; якщо length >8, б'ємо 422 з `boundary="client_request"` ДО `recordToolExecutions`. Anthropic при цьому не викликається.
- `apps/server/src/obs/metrics.ts` — нова метрика `chat_tool_iteration_cap_hit_total{boundary}` (значення `anthropic_response | client_request`, фіксована кардинальність 2).
- `apps/server/src/modules/chat/chat.test.ts` — три нові тести під describe `chat handler — MAX_TOOL_ITERATIONS cap (M7)`:
  - 9 паралельних `tool_use` від Anthropic → 422 + інкремент `{boundary=anthropic_response}`.
  - Рівно 8 `tool_use` від Anthropic → 200 з `tool_calls.length === 8` (порогове значення дозволене).
  - 9 `tool_use` у клієнтському `tool_calls_raw` → 422 + інкремент `{boundary=client_request}` + `anthropicMessages` НЕ викликаний.

**Що навмисно НЕ робилось:**

- "Track per-request total tokens consumed (read from Anthropic response headers)" з recommendation-секції — окремий follow-up: потребує запису у Postgres + дашборду + threshold-tuning. Поточний cap на кількість `tool_use`-блоків закриває dominant attack path (runaway loop), token-cap — defence-in-depth для повільніших, але дорожчих відповідей.
- ChatLoopError-клас — вирішили не вводити окремий error-тип, бо хендлер відповідає прямо через `res.status(422).json(...)`; payload дає клієнту й Sentry-фільтрам стабільний `code: "MAX_TOOL_ITERATIONS"`.
