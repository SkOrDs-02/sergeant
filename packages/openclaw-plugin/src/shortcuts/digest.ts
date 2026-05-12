import { extractText } from "./router.js";
import type { ShortcutDefinition } from "./types.js";

export const digestShortcut: ShortcutDefinition = {
  slug: "digest",
  patterns: [/^\/digest\s+(?<period>day|week)$/i, /^\/digest$/i, /^дайджест$/i],
  captureGroups: ["period"],
  toolCalls: [
    { toolName: "get_posthog_stats", buildParams: () => ({}) },
    { toolName: "get_stripe_metrics", buildParams: () => ({}) },
    { toolName: "get_sentry_issues", buildParams: () => ({ limit: 3 }) },
    {
      toolName: "read_github",
      buildParams: () => ({ resource: "pulls" }),
    },
  ],
  parallel: true,
  render: (results, params) => {
    const period = params["period"] ?? "day";
    const posthog = extractText(results.get("get_posthog_stats"));
    const stripe = extractText(results.get("get_stripe_metrics"));
    const sentry = extractText(results.get("get_sentry_issues"));
    const prs = extractText(results.get("read_github"));
    return `📰 **Дайджест (${period})**\n\n**PostHog:**\n${posthog}\n\n**Stripe:**\n${stripe}\n\n**Sentry:**\n${sentry}\n\n**PRs:**\n${prs}`;
  },
};
