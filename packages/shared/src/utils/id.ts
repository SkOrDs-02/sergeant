/**
 * Shared ID generator — single source of truth for prefixed random IDs.
 *
 * Format: `<prefix>_<unix-ms>_<8-hex>`. Uses `crypto.randomUUID()` for
 * cryptographic randomness. Replaces all inline
 * `prefix_${Date.now()}_${Math.random().toString(36).slice(2, N)}` sites
 * which drifted between 5- and 8-char random tails (audit F8 —
 * docs/audits/2026-05-13-page-audit-08-nutrition.md).
 *
 * @lifecycle active
 * @owner @Skords-01
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}