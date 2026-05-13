/**
 * CSV renderer for `openclaw_write_audit` rows (ADR-0037 follow-up).
 *
 * Used by the `/audit … csv` slash-command to ship the same rows that
 * the inline-message format already shows, but in a spreadsheet-friendly
 * shape. Telegram delivers it via `replyWithDocument`.
 *
 * Columns are documented in the Telegram improvements roadmap §3.3:
 *   recorded_at, tool, action, persona, http_status, approval_id
 *
 * We intentionally keep this list short: anything richer (full input
 * payload, response body excerpts) belongs in the DB query, not in a
 * Telegram-attached CSV that the founder might forward to other people.
 *
 * RFC-4180 quoting: any field containing `,`, `"`, `\r`, or `\n` is
 * wrapped in double-quotes with `"` doubled. Newlines are normalised
 * to `\r\n` per the standard.
 */

export interface WriteAuditCsvRow {
  recorded_at: string;
  tool: string;
  action: string;
  persona: string | null;
  http_status: number | null;
  approval_id: string;
}

const CSV_COLUMNS = [
  "recorded_at",
  "tool",
  "action",
  "persona",
  "http_status",
  "approval_id",
] as const;

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Render a CSV blob with one header row plus one row per audit. Rows
 * arrive newest-first (same order as the Telegram message body) and we
 * preserve that — the founder downloading the CSV expects identical
 * ordering.
 */
export function renderWriteAuditCsv(rows: readonly WriteAuditCsvRow[]): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.recorded_at),
        csvEscape(r.tool),
        csvEscape(r.action),
        csvEscape(r.persona),
        csvEscape(r.http_status),
        csvEscape(r.approval_id),
      ].join(","),
    );
  }
  // RFC-4180 line ending; Excel and Numbers both accept LF too, but CRLF
  // round-trips cleanly through Telegram's document upload + iOS preview.
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Filename used for the `replyWithDocument` upload. Format
 * `openclaw-audit-YYYYMMDDTHHmmssZ.csv` is sortable lexicographically and
 * unique enough for ad-hoc re-runs (per-second resolution beats founder's
 * click cadence).
 */
export function buildAuditCsvFilename(now: Date = new Date()): string {
  const iso = now.toISOString();
  // 2026-05-03T12:34:56.789Z → 20260503T123456Z
  const compact = iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return `openclaw-audit-${compact}.csv`;
}
