/**
 * Shared types for the `tg_topic_archive` surface (ADR-0031 §5,
 * OpenClaw roadmap Phase 3 / Pain P8).
 *
 * Kept in a leaf file to avoid circular imports between `store.ts` (DB
 * helpers) and the consumers in `modules/openclaw/tools.ts` (read path)
 * + `routes/internal/alerts.ts` (write path).
 */

/**
 * Writer-kind tag stored in `tg_topic_archive.source`. Free-form TEXT in
 * the DB so a new writer ships without a migration; the union here keeps
 * call-sites honest.
 *
 *   - `alert`         — n8n WF posted via `/api/internal/alerts/post`.
 *   - `post_to_topic` — OpenClaw `post_to_topic` write-tool (ADR-0036).
 */
export type TgTopicArchiveSource = "alert" | "post_to_topic";

/**
 * One row in `tg_topic_archive`. ISO-8601 timestamps. `dedupeKey` is
 * NULL for non-alert writers (manual `post_to_topic`); see migration
 * 047 header for the partial-unique-index rationale.
 */
export interface TgTopicArchiveRecord {
  id: number;
  sentAt: string;
  topic: string;
  messageId: number;
  text: string;
  source: TgTopicArchiveSource;
  dedupeKey: string | null;
  metadata: Record<string, unknown>;
}
