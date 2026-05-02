import crypto from "node:crypto";

/**
 * Constant-time comparison of two strings/buffers as ASCII bytes.
 *
 * Uses Node's `crypto.timingSafeEqual` under the hood, which compares the
 * full byte length without short-circuiting on the first mismatch — the
 * whole point of "timing-safe". A naive `a === b` (or `String(a) === String(b)`)
 * leaks the position of the first mismatching byte through CPU branch timing,
 * which an attacker on the same network can statistically exploit to recover
 * a bearer/HMAC/webhook secret one byte at a time.
 *
 * Length must match exactly. We deliberately return `false` on a length
 * mismatch BEFORE constructing buffers — `timingSafeEqual` itself throws on
 * unequal-length inputs, so without this guard we'd leak the expected length
 * via thrown-error timing. The length-check leak (one bit: "is len(a) =
 * len(b)?") is acceptable because the attacker already controls one side
 * of the comparison and length is often public anyway.
 *
 * Inputs that aren't strings (e.g. `string[]` from a duplicated header) are
 * coerced via `String(…)` first, which matches the historical behaviour of
 * the call sites this helper replaced. Empty/undefined → `false`.
 */
export function safeStringEqual(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
