import { extractText } from "./router.js";
import type { ShortcutDefinition } from "./types.js";

/**
 * `/remind <when> <what>` and `нагадай <when> <what>` (Ukrainian).
 *
 * Delegates to `set_reminder` — the dedicated reminders tool registered in
 * Stage 3. The shortcut keeps the canned UI but lets the server choose the
 * delivery channel (telegram/whatsapp) based on founder config.
 */
export const remindShortcut: ShortcutDefinition = {
  slug: "remind",
  patterns: [
    /^\/remind\s+(?<when>.+?)\s+(?<what>.+)$/i,
    /^нагадай\s+(?<when>.+?)\s+(?<what>.+)$/i,
  ],
  captureGroups: ["when", "what"],
  toolCalls: [
    {
      toolName: "set_reminder",
      buildParams: (captured) => ({
        reminderText: captured["what"] ?? "",
        dueAtIso: captured["when"] ?? "",
      }),
    },
  ],
  render: (results, params) => {
    const result = extractText(results.get("set_reminder"));
    const what = params["what"] ?? "";
    const when = params["when"] ?? "";
    return `⏰ **Нагадування записано**\n\n> ${what}\n> Коли: ${when}\n\n${result}`;
  },
};
