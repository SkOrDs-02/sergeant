import type { ShortcutDefinition } from "../shortcut-router.js";
import { extractText } from "../shortcut-router.js";

export const posthogShortcut: ShortcutDefinition = {
  slug: "posthog",
  patterns: [/^\/posthog$/i, /^що по posthog$/i, /^постхог$/i],
  toolCalls: [{ toolName: "get_posthog_stats", buildParams: () => ({}) }],
  render: (results) => {
    const data = extractText(results.get("get_posthog_stats"));
    return `📈 **PostHog сьогодні**\n\n${data}`;
  },
};
