import type { ShortcutDefinition } from "../shortcut-router.js";
import { extractText } from "../shortcut-router.js";

export const releasesShortcut: ShortcutDefinition = {
  slug: "releases",
  patterns: [/^\/releases$/i, /^що по релізах$/i, /^релізи$/i],
  toolCalls: [
    { toolName: "get_github_releases", buildParams: () => ({ limit: 5 }) },
  ],
  render: (results) => {
    const data = extractText(results.get("get_github_releases"));
    return `🏷️ **Останні 5 релізів**\n\n${data}`;
  },
};
