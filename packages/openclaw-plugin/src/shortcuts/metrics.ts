import type { ShortcutDefinition } from "../shortcut-router.js";
import { extractText } from "../shortcut-router.js";

export const metricsShortcut: ShortcutDefinition = {
  slug: "metrics",
  patterns: [
    /^\/metrics$/i,
    /^як справи з метриками$/i,
    /^дай метрики$/i,
    /^метрики$/i,
  ],
  toolCalls: [
    { toolName: "get_posthog_stats", buildParams: () => ({}) },
    { toolName: "get_stripe_metrics", buildParams: () => ({}) },
    { toolName: "get_sentry_issues", buildParams: () => ({ limit: 5 }) },
  ],
  parallel: true,
  render: (results) => {
    const posthog = extractText(results.get("get_posthog_stats"));
    const stripe = extractText(results.get("get_stripe_metrics"));
    const sentry = extractText(results.get("get_sentry_issues"));
    return `📊 **Метрики сьогодні**\n\n**PostHog:**\n${posthog}\n\n**Stripe:**\n${stripe}\n\n**Sentry (top 5):**\n${sentry}`;
  },
};
