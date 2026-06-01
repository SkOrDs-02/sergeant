import { z } from "zod";

/**
 * Audit 03 F3 (severity: critical, perspective: security).
 *
 * `useChatSend` accepts `data.tool_calls` from the Anthropic-proxy and feeds
 * each entry straight into `executeActions` — which routes by `name` and
 * destructures `input` into LocalStorage mutators (`create_transaction`,
 * `mark_habit_done`, `log_meal`, `create_habit`, …). Without runtime
 * validation a contract drift between server↔client (or a model that emits
 * `input: null`, `name: 42`, or a missing `id`) reaches the executor and
 * either crashes the turn or performs a mutation with a corrupted payload.
 *
 * This schema is the **structural firewall**: every entry must have
 * `id: string`, `name: string`, `input: object` before any handler runs.
 * Per-tool input shape is still enforced by the TS `ChatAction` union at
 * compile time + each handler's own narrowing. The audit also recommends a
 * full discriminated union per tool-name; that lands as a server-side mirror
 * + per-tool strict variants in a follow-up — gating critical attack surface
 * at the envelope is the load-bearing change here.
 *
 * AI-CONTEXT: if `safeParse` fails we DO NOT execute any tool from the batch.
 * The caller surfaces a "Не вдалося виконати дію" toast and falls back to
 * rendering `data.text` (or the raw assistant turn) without mutations.
 */
export const ToolCallEnvelopeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
});

export type ToolCallEnvelope = z.infer<typeof ToolCallEnvelopeSchema>;

export const ToolCallsArraySchema = z.array(ToolCallEnvelopeSchema);

export function parseToolCalls(value: unknown):
  | { ok: true; value: ToolCallEnvelope[] }
  | { ok: false; issues: string[] } {
  const parsed = ToolCallsArraySchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 5)
    .map((iss) => `${iss.path.join(".") || "<root>"}: ${iss.message}`);
  return { ok: false, issues };
}
