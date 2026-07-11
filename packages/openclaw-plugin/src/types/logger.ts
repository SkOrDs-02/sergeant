/**
 * Shared hook logger signature — injected from `api.logger` / the SDK
 * where available, falls back to `console`. Kept injectable so unit
 * tests can assert log calls. Single source of truth for every hook's
 * `log?:` field (previously duplicated per-hook as separate type
 * aliases and inline function types).
 */
export type HookLogger = (
  level: "debug" | "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>,
) => void;

/** Default `HookLogger` — prefixes `[sergeant]` and routes to the matching
 *  `console` method. Used by every hook whose `opts.log` is omitted. */
export const defaultLog: HookLogger = (level, message, fields) => {
  const payload = fields ? ` ${JSON.stringify(fields)}` : "";
  if (level === "error") console.error(`[sergeant] ${message}${payload}`);
  else if (level === "warn") console.warn(`[sergeant] ${message}${payload}`);
  else console.log(`[sergeant] ${message}${payload}`);
};
