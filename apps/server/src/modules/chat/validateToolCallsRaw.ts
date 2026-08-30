/**
 * B32 (`docs/90-work/audits/ai-testing-2026-08-25.md`) — server-side
 * allowlist + provenance checks for `tool_calls_raw` on the second
 * (`tool_results`) turn of `/api/chat`.
 *
 * The shared Zod schema (`ToolCallsRawBlockSchema`,
 * `packages/shared/src/schemas/api.ts`) already rejects malformed blocks and
 * unknown fields (`.strict()`) at the HTTP boundary — but it can't know the
 * real tool registry (server-only, `TOOLS` from `./tools.js`) or
 * cross-reference `tool_results`, so those two checks live here, one level
 * in, right where the two arrays actually meet.
 *
 * Two invariants enforced:
 *
 * 1. Every `tool_use.name` must be a real tool from `TOOLS`; every
 *    `server_tool_use.name` must be the one Anthropic-hosted tool we wire
 *    (`tool_search_tool_regex`, `./toolSearch.js`). An unknown name is a
 *    400, not a silent pass-through into the assistant-role message
 *    Anthropic will replay back into the conversation.
 * 2. Every `tool_use.id` must have a matching `tool_results[].tool_use_id`
 *    (provenance) — otherwise `chat_prompt_injection_attempt_total` and
 *    `chat_tool_invocations_total` can't attribute the block to a real
 *    tool and collapse to `"unknown"` (`toolOutputWrapping.ts`,
 *    `toolMetrics.ts`). A `tool_use` block with no matching result is
 *    either a client bug or an attempt to smuggle an unaccounted-for block
 *    into the assistant role.
 */
import { ValidationError } from "../../obs/errors.js";
import { TOOLS } from "./tools.js";
import { TOOL_SEARCH_TOOL } from "./toolSearch.js";

const KNOWN_TOOL_NAMES: ReadonlySet<string> = new Set(TOOLS.map((t) => t.name));

interface ToolUseLikeBlock {
  type: "tool_use" | "server_tool_use";
  id: string;
  name: string;
}

export interface ToolResultLike {
  tool_use_id: string;
}

function isToolUseLikeBlock(block: unknown): block is ToolUseLikeBlock {
  if (!block || typeof block !== "object") return false;
  const b = block as { type?: unknown; id?: unknown; name?: unknown };
  return (
    (b.type === "tool_use" || b.type === "server_tool_use") &&
    typeof b.id === "string" &&
    typeof b.name === "string"
  );
}

/**
 * Throws `ValidationError` (400) when `tool_calls_raw` carries an unknown
 * tool name or a `tool_use` block without a matching `tool_results` entry.
 * Read-only — does not mutate either input array.
 */
export function validateToolCallsRawProvenance(
  toolCallsRaw: ReadonlyArray<unknown>,
  toolResults: ReadonlyArray<ToolResultLike>,
): void {
  const resultIds = new Set(toolResults.map((r) => r.tool_use_id));

  for (const block of toolCallsRaw) {
    if (!isToolUseLikeBlock(block)) continue;
    const { type, id, name } = block;

    if (type === "server_tool_use") {
      if (name !== TOOL_SEARCH_TOOL.name) {
        throw new ValidationError(
          `Невідомий server tool у tool_calls_raw: "${name}"`,
          { code: "CHAT_UNKNOWN_TOOL_NAME", cause: { type, name, id } },
        );
      }
      continue;
    }

    if (!KNOWN_TOOL_NAMES.has(name)) {
      throw new ValidationError(
        `Невідомий інструмент у tool_calls_raw: "${name}"`,
        { code: "CHAT_UNKNOWN_TOOL_NAME", cause: { type, name, id } },
      );
    }
    if (!resultIds.has(id)) {
      throw new ValidationError("tool_use-блок без відповідного tool_result", {
        code: "CHAT_TOOL_USE_PROVENANCE_MISMATCH",
        cause: { name, id },
      });
    }
  }
}
