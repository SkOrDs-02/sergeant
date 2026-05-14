/**
 * Layer 0 shortcut: `/forget id|topic|since|query|confirm|cancel` — founder-control
 * AI-memory deletion (PR-23).
 *
 * Mode dispatch via regex; маршрутизуємо на single `forget_memory` tool.
 *
 * Patterns:
 *   /forget id 123
 *   /forget topic some-topic
 *   /forget since 2025-04-01
 *   /forget query шось важливе
 *   /forget confirm <uuid>
 *   /forget cancel  <uuid>
 *
 * Перший regex match виграє. Шорткат лише парсить + форвардить — actual
 * delete/preview logic живе у `forget_memory` tool (HTTP до сервера).
 */

import type { ShortcutDefinition, ShortcutParams } from "../shortcut-router.js";
import { extractText } from "../shortcut-router.js";

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
        if (!parsed) {
          // Defensive: shortcut-router пас тільки коли regex matched, тож
          // captured завжди має одне з полів — але повертаємо stub-call
          // з невалідним mode щоб zod-валідація на server-боці дала
          // зрозумілий error замість мовчазного no-op.
          return { mode: "byId", memoryId: -1 };
        }
        return parsed;
      },
    },
  ],
  render: (results) => {
    const data = extractText(results.get("forget_memory"));
    return `🧹 **Forget**\n\n${data}`;
  },
};
