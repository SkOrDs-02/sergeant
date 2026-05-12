import { extractText } from "./router.js";
import type { ShortcutDefinition } from "./types.js";

export const sentryShortcut: ShortcutDefinition = {
  slug: "sentry",
  patterns: [/^\/sentry$/i, /^що по sentry$/i, /^сентрі$/i],
  toolCalls: [
    {
      toolName: "get_sentry_issues",
      buildParams: () => ({ period: "24h", limit: 5 }),
    },
  ],
  render: (results) => {
    const issues = extractText(results.get("get_sentry_issues"));
    return `🐛 **Sentry (top 5, last 24h)**\n\n${issues}`;
  },
};
