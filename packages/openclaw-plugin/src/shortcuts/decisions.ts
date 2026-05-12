import { extractText } from "./router.js";
import type { ShortcutDefinition } from "./types.js";

/**
 * `/decisions` — last 10 founder-level decisions logged via
 * `record_decision`.
 *
 * Earlier revision queried `ai_decisions` (column `title`) — neither the
 * table nor the column exists. The canonical table is `openclaw_decisions`
 * (migration 028_openclaw.sql, columns `id, decided_at, topic, decision`),
 * which is the same row `insertDecision` writes into
 * (apps/server/src/modules/openclaw/store.ts). `openclaw_decisions` is
 * already in `QUERY_APP_DB_TABLE_ALLOWLIST`.
 */
export const decisionsShortcut: ShortcutDefinition = {
  slug: "decisions",
  patterns: [/^\/decisions$/i, /^рішення$/i, /^що вирішили$/i],
  toolCalls: [
    {
      toolName: "query_app_db",
      buildParams: () => ({
        sql: "SELECT id, topic, decision, decided_at FROM openclaw_decisions ORDER BY decided_at DESC LIMIT 10",
      }),
    },
  ],
  render: (results) => {
    const data = extractText(results.get("query_app_db"));
    return `📋 **Останні 10 рішень**\n\n${data}`;
  },
};
