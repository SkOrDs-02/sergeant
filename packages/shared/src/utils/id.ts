/**
 * Shared ID generator — single source of truth for prefixed random IDs.
 *
 * Format: `<prefix>_<uuid>`. Uses the platform-native UUID generator rather
 * than timestamp + pseudo-random suffixes.
 *
 * @lifecycle active
 * @owner @Skords-01
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
