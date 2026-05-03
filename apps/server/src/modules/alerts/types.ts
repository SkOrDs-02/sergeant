/**
 * Shared types for the `tg_alert_acks` accountability surface (ADR-0038).
 *
 * Kept in a leaf file to avoid circular imports between `store.ts` (DB
 * helpers) and `routes/internal/alerts.ts` (HTTP route + Zod schemas).
 */

/**
 * Severity tier for one Sergeant_alert_bot broadcast. CHECK-enforced on
 * the DB level so a typo in n8n cannot smuggle in `"P00"` and break the
 * WF-103 escalation filter.
 */
export type TgAlertSeverity = "P0" | "P1" | "P2" | "P3";

/**
 * Inline-keyboard button label that an operator clicked in Telegram.
 *
 *   - `read`           — "✅ Прочитав", terminal acknowledgement.
 *   - `investigating`  — "🔄 Розбираю", soft hand-off.
 *   - `muted`          — "🔕 Замутити 30хв", suppresses re-broadcast in
 *                        the WF-X dedup window (B.1, follow-up PR).
 */
export type TgAlertAckAction = "read" | "investigating" | "muted";

/**
 * One row in `tg_alert_acks`. ISO-8601 timestamps; nullable
 * fields reflect the lifecycle state (NULL until the corresponding
 * transition happens).
 */
export interface TgAlertAckRecord {
  id: number;
  posted_at: string;
  alert_id: string;
  topic: string;
  severity: TgAlertSeverity;
  summary: string | null;
  ack_at: string | null;
  ack_by_tg_user_id: number | null;
  ack_action: TgAlertAckAction | null;
  escalated_at: string | null;
  metadata: Record<string, unknown>;
}
