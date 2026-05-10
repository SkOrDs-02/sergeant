import type { ShortcutDefinition } from "../shortcut-router.js";
import { extractText } from "../shortcut-router.js";

export const stripeShortcut: ShortcutDefinition = {
  slug: "stripe",
  patterns: [/^\/stripe$/i, /^що по stripe$/i, /^страйп$/i],
  toolCalls: [{ toolName: "get_stripe_metrics", buildParams: () => ({}) }],
  render: (results) => {
    const data = extractText(results.get("get_stripe_metrics"));
    return `💳 **Stripe сьогодні**\n\n${data}`;
  },
};
