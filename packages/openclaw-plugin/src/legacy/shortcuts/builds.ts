import type { ShortcutDefinition } from "../shortcut-router.js";
import { extractText } from "../shortcut-router.js";

export const buildsShortcut: ShortcutDefinition = {
  slug: "builds",
  patterns: [/^\/builds$/i, /^що по білдах$/i, /^деплої$/i],
  toolCalls: [
    { toolName: "get_server_stats", buildParams: () => ({}) },
    { toolName: "get_github_releases", buildParams: () => ({ limit: 10 }) },
  ],
  parallel: true,
  render: (results) => {
    const server = extractText(results.get("get_server_stats"));
    const releases = extractText(results.get("get_github_releases"));
    return `🏗️ **Builds & Deploys**\n\n**Server:**\n${server}\n\n**Releases:**\n${releases}`;
  },
};
