import { extractText } from "./router.js";
import type { ShortcutDefinition } from "./types.js";

export const heartbeatShortcut: ShortcutDefinition = {
  slug: "heartbeat",
  patterns: [/^\/heartbeat$/i, /^\/health$/i, /^пінг$/i, /^ping$/i],
  toolCalls: [{ toolName: "get_server_stats", buildParams: () => ({}) }],
  render: (results) => {
    const data = extractText(results.get("get_server_stats"));
    return `💓 **Heartbeat**\n\n${data}`;
  },
};
