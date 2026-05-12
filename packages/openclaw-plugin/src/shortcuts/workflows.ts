import { extractText } from "./router.js";
import type { ShortcutDefinition } from "./types.js";

export const workflowsShortcut: ShortcutDefinition = {
  slug: "workflows",
  patterns: [/^\/workflows$/i, /^що по воркфлоу$/i, /^n8n$/i],
  toolCalls: [{ toolName: "read_workflow_logs", buildParams: () => ({}) }],
  render: (results) => {
    const data = extractText(results.get("read_workflow_logs"));
    return `⚙️ **Workflows (n8n)**\n\n${data}`;
  },
};
