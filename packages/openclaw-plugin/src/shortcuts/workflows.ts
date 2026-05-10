import type { ShortcutDefinition } from "../shortcut-router.js";
import { extractText } from "../shortcut-router.js";

export const workflowsShortcut: ShortcutDefinition = {
  slug: "workflows",
  patterns: [/^\/workflows$/i, /^що по воркфлоу$/i, /^n8n$/i],
  toolCalls: [{ toolName: "read_workflow_logs", buildParams: () => ({}) }],
  render: (results) => {
    const data = extractText(results.get("read_workflow_logs"));
    return `⚙️ **Workflows (n8n)**\n\n${data}`;
  },
};
