/**
 * Stage 4b copy of the `/forget` shortcut. Logic is identical to
 * `legacy/shortcuts/forget.ts`; this module exists so the new
 * `packages/openclaw-plugin/src/shortcuts/` router pulls from a local
 * file with the unified type contract.
 *
 * See `legacy/shortcuts/forget.ts` for full docstring + regex rationale.
 */

import { extractText } from "./router.js";
import type { ShortcutDefinition, ShortcutParams } from "./types.js";

type ForgetParseResult =
  | { mode: "byId"; memoryId: number }
  | { mode: "byTopic"; topic: string }
  | { mode: "since"; sinceDate: string }
  | { mode: "previewQuery"; query: string }
  | { mode: "confirm"; token: string }
  | { mode: "cancel"; token: string };

function parseForget(captured: ShortcutParams): ForgetParseResult | null {
  if (captured["memoryId"]) {
    const n = Number(captured["memoryId"]);
    if (Number.isFinite(n) && n > 0) return { mode: "byId", memoryId: n };
  }
  if (captured["topic"]) {
    return { mode: "byTopic", topic: captured["topic"] };
  }
  if (captured["sinceDate"]) {
    return { mode: "since", sinceDate: captured["sinceDate"] };
  }
  if (captured["confirmToken"]) {
    return { mode: "confirm", token: captured["confirmToken"] };
  }
  if (captured["cancelToken"]) {
    return { mode: "cancel", token: captured["cancelToken"] };
  }
  if (captured["query"]) {
    return { mode: "previewQuery", query: captured["query"] };
  }
  return null;
}

export const forgetShortcut: ShortcutDefinition = {
  slug: "forget",
  patterns: [
    /^\/forget\s+id\s+(?<memoryId>\d+)\s*$/i,
    /^\/forget\s+topic\s+(?<topic>.+?)\s*$/i,
    /^\/forget\s+since\s+(?<sinceDate>\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?)\s*$/i,
    /^\/forget\s+confirm\s+(?<confirmToken>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/i,
    /^\/forget\s+cancel\s+(?<cancelToken>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/i,
    /^\/forget\s+query\s+(?<query>.+)$/i,
  ],
  captureGroups: [
    "memoryId",
    "topic",
    "sinceDate",
    "confirmToken",
    "cancelToken",
    "query",
  ],
  toolCalls: [
    {
      toolName: "forget_memory",
      buildParams: (captured) => {
        const parsed = parseForget(captured);
        if (!parsed) return { mode: "byId", memoryId: -1 };
        return parsed;
      },
    },
  ],
  render: (results) => {
    const data = extractText(results.get("forget_memory"));
    return `🧹 **Forget**\n\n${data}`;
  },
};
