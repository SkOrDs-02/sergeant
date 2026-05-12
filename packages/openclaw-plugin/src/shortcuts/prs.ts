import { extractText } from "./router.js";
import type { ShortcutDefinition } from "./types.js";

export const prsShortcut: ShortcutDefinition = {
  slug: "prs",
  patterns: [/^\/prs$/i, /^що по prs$/i, /^що по pr$/i, /^які пр$/i],
  toolCalls: [
    { toolName: "read_github", buildParams: () => ({ resource: "pulls" }) },
  ],
  render: (results) => {
    const data = extractText(results.get("read_github"));
    return `🔀 **Open PRs**\n\n${data}`;
  },
};
