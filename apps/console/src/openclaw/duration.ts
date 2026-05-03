/**
 * Compact duration parser for OpenClaw slash-command arguments.
 *
 * Used by `/audit since=<dur>` to convert tokens like `30m`, `24h`, `7d`,
 * `2w` into milliseconds, which the handler subtracts from `Date.now()`
 * to compute a wall-clock cutoff (`recordedAfterIso`).
 *
 * Grammar (case-insensitive):
 *   <integer>(s|m|h|d|w)
 *
 * Returns `null` for any malformed token — caller MUST treat that as
 * "argument absent" and either skip or return a usage hint. We do NOT
 * fall back to a default duration here: silent fall-back hides typos
 * (`/audit since=24hr` would otherwise look like it worked but ignore
 * the arg).
 *
 * Bounds: 1..30 days. We refuse longer windows because the underlying
 * SELECT scans by `recorded_at DESC` with a LIMIT that the API caps at
 * 100 — anything longer than 30d is better served by an ad-hoc SQL
 * query rather than a Telegram listing.
 */
export function parseDuration(input: string): number | null {
  const m = /^(\d+)([smhdw])$/i.exec(input.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]?.toLowerCase();
  if (!Number.isFinite(n) || n <= 0) return null;
  let ms: number;
  switch (unit) {
    case "s":
      ms = n * 1_000;
      break;
    case "m":
      ms = n * 60_000;
      break;
    case "h":
      ms = n * 3_600_000;
      break;
    case "d":
      ms = n * 86_400_000;
      break;
    case "w":
      ms = n * 7 * 86_400_000;
      break;
    default:
      return null;
  }
  // Cap at 30 days (matches LIMIT-100 SELECT semantics — see ADR-0037).
  if (ms > 30 * 86_400_000) return null;
  return ms;
}
