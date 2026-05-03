/**
 * Sensitive query-key policy for React Query persisters.
 *
 * Stage 0 / PR #004 from `docs/planning/storage-roadmap.md`. The
 * web (`apps/web/src/shared/lib/api/queryClientPersister.ts`) and mobile
 * (`apps/mobile/src/sync/persister/mmkvPersister.ts`) persisters
 * dehydrate a snapshot of the React Query cache to disk on every
 * cache mutation so cold-start can warm-rehydrate. That snapshot is
 * a verbatim JSON of the cached HTTP responses — fine for budgets,
 * meal logs, routine state, but **not** for:
 *
 *   - the auth subsystem (`/api/auth/*`, Better-Auth sessions);
 *   - the "who am I" + finance balance feeds (`/api/me/*`, includes
 *     email, settings, and the user's bank balance projection);
 *   - the AI coach feed (`/api/coach/*`, contains personalised
 *     advice strings derived from spending patterns + custom memory);
 *   - the cloud-sync subsystem itself (`/api/sync/*`, includes
 *     `module_data` JSONB chunks of every other module).
 *
 * Persisting these to IDB / MMKV is a defence-in-depth regression:
 * the data is reachable to any XSS, lingers across logout (the
 * persister is keyed by build-id, not by user-id), and survives
 * device transfer if MMKV/IDB is unencrypted at rest.
 *
 * The exclusion list below is consulted by both web and mobile
 * `shouldDehydrateQuery` selectors. The matcher is deliberately
 * conservative — string-typed segments only, no deep traversal —
 * because a query-key tuple can mix strings, numbers, and objects
 * and we'd rather over-exclude than over-persist.
 *
 * Adding to the list:
 *   1. The query-key factory in `apps/web/src/shared/lib/api/queryKeys.ts`
 *      or `packages/api-client/src/react/queryKeys.ts` defines the
 *      first segment.
 *   2. Pick the narrowest match: a top-level namespace (`coach`),
 *      or a sub-resource fragment (`balance`, `balance-final`).
 *   3. Add a snapshot test in
 *      `apps/web/src/shared/lib/__tests__/queryClientPersister.test.ts`
 *      so a future contributor can't accidentally re-include a key.
 */

/**
 * Top-level query-key namespaces that must never be persisted.
 *
 * These match `queryKey[0]` exactly (case-sensitive). Anything under
 * the namespace — `["coach", "memory"]`, `["coach", "insight", "2025-05-01"]`,
 * `["me", "current"]`, `["sync", "manifest"]`, `["auth", "session"]` —
 * inherits the exclusion.
 */
export const SENSITIVE_QUERY_KEY_NAMESPACES: ReadonlySet<string> = new Set([
  // Auth subsystem (Better-Auth sessions, user profile metadata).
  // The web app reads "who am I" via `useUser()` from
  // `@sergeant/api-client/react`, which uses `["me", ...]`. The
  // legacy `["auth", ...]` namespace is reserved for Better-Auth
  // hooks — block both as a belt-and-braces measure.
  "auth",
  "me",
  // AI coach feed — personalised advice strings, memory.
  "coach",
  // Cloud-sync subsystem — `module_data` payloads, manifest, etc.
  "sync",
]);

/**
 * Query-key segments (anywhere in the tuple) that must never be
 * persisted. Used for sub-resources whose top-level namespace is
 * shared with non-sensitive resources — e.g. `["privat", "balance-final", …]`
 * sits under the otherwise-fine `privat` namespace, so we exclude
 * the `balance-final` segment specifically.
 *
 * Match is exact, segment-by-segment. We don't fuzzy-match
 * substrings because tuples can carry arbitrary user-controlled
 * strings (search queries, barcodes) and a substring rule could
 * accidentally exclude the wrong entries.
 */
export const SENSITIVE_QUERY_KEY_FRAGMENTS: ReadonlySet<string> = new Set([
  // /api/me/finance/balance and the privat-bank balance feed.
  "balance",
  "balance-final",
]);

/**
 * Returns `true` if the query-key tuple targets a sensitive feed and
 * therefore must be excluded from the persister snapshot.
 *
 * The function is total: any non-array input, empty array, or
 * tuple of non-string segments returns `false` (i.e. "safe to
 * persist"). The intent is to err on the side of *not* surprising
 * a future caller with a "your test queries are missing from
 * snapshot" footgun.
 */
export function isSensitiveQueryKey(
  queryKey: readonly unknown[] | unknown,
): boolean {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return false;
  for (const segment of queryKey) {
    if (typeof segment !== "string") continue;
    if (SENSITIVE_QUERY_KEY_NAMESPACES.has(segment)) return true;
    if (SENSITIVE_QUERY_KEY_FRAGMENTS.has(segment)) return true;
  }
  return false;
}
