import { z } from "zod";
import { REST_DEFAULTS } from "@sergeant/fizruk-domain";

/**
 * Persisted shape of `STORAGE_KEYS.FIZRUK_REST_SETTINGS`.
 *
 * Each `REST_DEFAULTS` key is an optional positive number — users only
 * override the categories they care about, and `useRestSettings` merges
 * the override on top of `REST_DEFAULTS` at read time. We intentionally
 * keep the schema permissive (`.passthrough()` on extra keys), because
 * older app versions may have written keys that newer versions removed
 * from `REST_DEFAULTS`; dropping them silently with `safeReadLSValidated`
 * is fine, but the user's override for a still-supported category should
 * never be wiped out by a partial write that happens to also include a
 * stale key.
 */
export const RestSettingsSchema = z
  .object(
    Object.fromEntries(
      Object.keys(REST_DEFAULTS).map((k) => [
        k,
        z.number().positive().optional(),
      ]),
    ) as { [K in keyof typeof REST_DEFAULTS]: z.ZodOptional<z.ZodNumber> },
  )
  .passthrough();

export type RestSettings = z.infer<typeof RestSettingsSchema>;
