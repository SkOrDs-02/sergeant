import { z } from "zod";

/**
 * Persisted shape of `STORAGE_KEYS.HUB_PREFS`.
 *
 * Hub preferences are an open key/value bag — feature owners drop in
 * scalar flags (booleans, layout strings, accent IDs) without going
 * through a central registry. We validate only the structural envelope
 * (must be a JSON object) and let `useHubPref<T>` cast individual values
 * at the read site, where the call already supplies a typed default.
 *
 * Keeping this schema deliberately loose preserves the "no central
 * migration required" property of `HUB_PREFS`, while still rejecting the
 * common corruption modes — strings, arrays, `null` — that would
 * otherwise sneak past `safeReadLS<HubPrefs>`'s static cast.
 */
export const HubPrefsSchema = z.record(z.string(), z.unknown());

export type HubPrefs = z.infer<typeof HubPrefsSchema>;
