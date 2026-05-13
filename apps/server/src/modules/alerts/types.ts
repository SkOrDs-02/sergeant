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
 *                        the WF-X dedup window (B.1).
 *
 * `ack_action` CHECK constraint у DB лишається на 3 значеннях. Snooze 1h/4h
 * — окрема transition (запис у `snoozed_until_at`), не ack-action, тому НЕ
 * член цього enum.
 */
export type TgAlertAckAction = "read" | "investigating" | "muted";

/**
 * Тривалість snooze (Tier 2 repeat-ping inline-keyboard). Map на ms у
 * route-layer; зберігається у `snoozed_until_at` як absolute timestamp,
 * не як duration — простіше для WF-105/WF-106 cron query.
 */
export type TgAlertSnoozeDuration = "1h" | "4h";

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
  /**
   * Tier 2 @ 60min (WF-105 repeat-ping cron). NULL → ще не re-pinged.
   * UPDATE-once: WHERE repeated_at IS NULL guard забезпечує один repeat
   * на alert.
   */
  repeated_at: string | null;
  /**
   * Tier 3 @ 120min (WF-106 sentry-warn cron). NULL → Sentry warning ще
   * не виданий. UPDATE-once.
   */
  sentry_warned_at: string | null;
  /**
   * Operator-set snooze TTL (Tier 2 button «🕐 1h» / «🕓 4h»). Tier-crons
   * фільтрують `WHERE snoozed_until_at IS NULL OR snoozed_until_at < NOW()`.
   */
  snoozed_until_at: string | null;
  metadata: Record<string, unknown>;
  /**
   * O4 / B.1 dedup columns (migration 060). NULL → legacy alert posted
   * without a dedup_signature. `occurrence_count` defaults to 1 (not
   * NULL) — the row itself is one occurrence.
   */
  dedup_signature: string | null;
  occurrence_count: number;
  last_occurrence_at: string | null;
  telegram_chat_id: number | null;
  telegram_message_id: number | null;
}
