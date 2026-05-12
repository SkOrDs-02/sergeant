import { extractText } from "./router.js";
import type { ShortcutDefinition } from "./types.js";

export const recallShortcut: ShortcutDefinition = {
  slug: "recall",
  patterns: [/^\/recall\s+(?<query>.+)$/i],
  captureGroups: ["query"],
  toolCalls: [
    {
      toolName: "recall_memory",
      buildParams: (captured) => ({ query: captured["query"] ?? "", topK: 5 }),
    },
  ],
  render: (results) => {
    const data = extractText(results.get("recall_memory"));
    return `🧠 **Пам'ять**\n\n${data}`;
  },
};
