import { extractText } from "./router.js";
import type { ShortcutDefinition } from "./types.js";

export const refreshMetricsShortcut: ShortcutDefinition = {
  slug: "refresh_metrics",
  patterns: [/^\/refresh_metrics$/i, /^оновити метрики$/i, /^рефреш$/i],
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
    return `🔄 **Метрики оновлено**\n\n**PostHog:**\n${posthog}\n\n**Stripe:**\n${stripe}\n\n**Sentry:**\n${sentry}`;
  },
};
