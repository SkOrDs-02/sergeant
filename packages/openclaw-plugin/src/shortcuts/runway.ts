import { extractText } from "./router.js";
import type { ShortcutDefinition } from "./types.js";

/**
 * `/runway` — finance pulse + Sergeant ops cost over the last 30 days.
 *
 * The previous implementation queried `business_snapshot` — a table that
 * was never provisioned in any migration and is not part of
 * `QUERY_APP_DB_TABLE_ALLOWLIST` (apps/server/src/modules/openclaw/types.ts).
 * Calling `query_app_db` against it returned HTTP 400 verbatim through
 * the gateway, polluting the rendered Markdown (handoff doc § 10,
 * 2026-05-12). Until the business-snapshot pipeline lands as part of
 * Stage 5 we report what we actually have: Sergeant's own cost-rollup
 * from `openclaw_invocations` (in the allowlist) plus Stripe metrics.
 */
export const runwayShortcut: ShortcutDefinition = {
  slug: "runway",
  patterns: [/^\/runway$/i, /^скільки runway$/i, /^runway$/i],
  toolCalls: [
    {
      toolName: "query_app_db",
      buildParams: () => ({
        sql: "SELECT COUNT(*) AS invocations, COALESCE(SUM(cost_usd), 0) AS cost_usd_30d FROM openclaw_invocations WHERE invoked_at >= NOW() - INTERVAL '30 days'",
      }),
    },
    { toolName: "get_stripe_metrics", buildParams: () => ({}) },
  ],
  parallel: true,
  render: (results) => {
    const ops = extractText(results.get("query_app_db"));
    const stripe = extractText(results.get("get_stripe_metrics"));
    return `🛫 **Runway**\n\n**Sergeant ops (last 30d):**\n${ops}\n\n**Stripe:**\n${stripe}\n\n_Business snapshot pipeline ще не провіжнено (Stage 5)._`;
  },
};
