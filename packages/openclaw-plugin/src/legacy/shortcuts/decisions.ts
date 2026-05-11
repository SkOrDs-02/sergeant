import type { ShortcutDefinition } from "../shortcut-router.js";
import { extractText } from "../shortcut-router.js";

export const decisionsShortcut: ShortcutDefinition = {
  slug: "decisions",
  patterns: [/^\/decisions$/i, /^рішення$/i, /^що вирішили$/i],
  toolCalls: [
    {
      toolName: "query_app_db",
      buildParams: () => ({
        sql: "SELECT id, title, decision, decided_at FROM ai_decisions ORDER BY decided_at DESC LIMIT 10",
      }),
    },
  ],
  render: (results) => {
    const data = extractText(results.get("query_app_db"));
    return `📋 **Останні 10 рішень**\n\n${data}`;
  },
};
