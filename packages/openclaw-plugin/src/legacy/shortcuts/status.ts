import type { ShortcutDefinition } from "../shortcut-router.js";
import { extractText } from "../shortcut-router.js";

export const statusShortcut: ShortcutDefinition = {
  slug: "status",
  patterns: [
    /^\/status$/i,
    /^як справи в продукті$/i,
    /^статус$/i,
    /^як справи$/i,
  ],
  toolCalls: [
    { toolName: "get_server_stats", buildParams: () => ({}) },
    { toolName: "get_sentry_issues", buildParams: () => ({ limit: 3 }) },
  ],
  parallel: true,
  render: (results) => {
    const server = extractText(results.get("get_server_stats"));
    const sentry = extractText(results.get("get_sentry_issues"));
    return `🟢 **Статус продукту**\n\n**Server:**\n${server}\n\n**Sentry:**\n${sentry}`;
  },
};
