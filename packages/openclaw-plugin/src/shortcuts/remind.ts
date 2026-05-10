import type { ShortcutDefinition } from "../shortcut-router.js";
import { extractText } from "../shortcut-router.js";

/**
 * `/remind` shortcut — delegates to `record_decision` as a placeholder.
 * In PR-C1b, `set_reminder` tool will be added and this shortcut will
 * delegate to it. For now, we record the intent as a decision.
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
      toolName: "record_decision",
      buildParams: (captured) => ({
        title: `Нагадування: ${captured["what"] ?? ""}`,
        decision: `Нагадати: "${captured["what"] ?? ""}" о ${captured["when"] ?? "невизначено"}`,
        context: "Створено через /remind shortcut",
      }),
    },
  ],
  render: (results, params) => {
    const result = extractText(results.get("record_decision"));
    const what = params["what"] ?? "";
    const when = params["when"] ?? "";
    return `⏰ **Нагадування записано**\n\n> ${what}\n> Коли: ${when}\n\n${result}`;
  },
};
