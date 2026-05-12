import { extractText } from "./router.js";
import type { ShortcutDefinition } from "./types.js";

export const runwayShortcut: ShortcutDefinition = {
  slug: "runway",
  patterns: [/^\/runway$/i, /^скільки runway$/i, /^runway$/i],
  toolCalls: [
    {
      toolName: "query_app_db",
      buildParams: () => ({
        sql: "SELECT * FROM business_snapshot ORDER BY created_at DESC LIMIT 1",
      }),
    },
    { toolName: "get_stripe_metrics", buildParams: () => ({}) },
  ],
  parallel: true,
  render: (results) => {
    const db = extractText(results.get("query_app_db"));
    const stripe = extractText(results.get("get_stripe_metrics"));
    return `🛫 **Runway**\n\n**Snapshot:**\n${db}\n\n**Stripe:**\n${stripe}`;
  },
};
